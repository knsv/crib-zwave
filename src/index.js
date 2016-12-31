var OZW = require('openzwave-shared');

var cribMq = require('../../crib-mq');

var cribLog = require('../../crib-log/src/api');

var log = cribLog.createLogger('crib-zwave', 'debug');

var buss = cribMq.register('crib-zwave');
log.info('Starting z.wave service ', process.cwd());

const DEVICE = process.env.CRIB_ZWAVE_DEVICE;

var ZWave = require('openzwave-shared');
var zwave = new ZWave({
  Logging: false,     // disable file logging (OZWLog.txt)
  ConsoleOutput: false // enable console logging
});

var nodes = [];

zwave.on('driver ready', function(homeid) {
    log.debug('scanning homeid=0x%s...', homeid.toString(16));
});

zwave.on('driver failed', function() {
    log.debug('failed to start driver');
    zwave.disconnect();
    process.exit();
});

zwave.on('node added', function(nodeid) {
    nodes[nodeid] = {
        manufacturer: '',
        manufacturerid: '',
        product: '',
        producttype: '',
        productid: '',
        type: '',
        name: '',
        loc: '',
        classes: {},
        ready: false,
    };
});

zwave.on('value added', function(nodeid, comclass, value) {
    if (!nodes[nodeid]['classes'][comclass])
        nodes[nodeid]['classes'][comclass] = {};
    nodes[nodeid]['classes'][comclass][value.index] = value;
});

zwave.on('value changed', function(nodeid, comclass, value) {
    if (nodes[nodeid]['ready']) {
        log.debug('node%d: changed: %d:%s:%s->%s', nodeid, comclass,
                value['label'],
                nodes[nodeid]['classes'][comclass][value.index]['value'],
                value['value']);
    }
    
    // if(value['label'] === 'Burglar'){
    //     log.debug('node%d: changed: %d:%s:%s->%s', nodeid, comclass,
    //         value['label'],
    //         nodes[nodeid]['classes'][comclass][value.index]['value'],
    //         value['value']);
    // }
    
    buss.emit('ZWAVE_EVENT',[{
      nodeid:nodeid,
      comclass:comclass,
      label: value['label'],
      oldVal: nodes[nodeid]['classes'][comclass][value.index]['value'],
      val: value['value'],
      value
    }]);
    nodes[nodeid]['classes'][comclass][value.index] = value;
});

zwave.on('value removed', function(nodeid, comclass, index) {
    if (nodes[nodeid]['classes'][comclass] &&
        nodes[nodeid]['classes'][comclass][index])
        delete nodes[nodeid]['classes'][comclass][index];
});

zwave.on('node ready', function(nodeid, nodeinfo) {
    nodes[nodeid]['manufacturer'] = nodeinfo.manufacturer;
    nodes[nodeid]['manufacturerid'] = nodeinfo.manufacturerid;
    nodes[nodeid]['product'] = nodeinfo.product;
    nodes[nodeid]['producttype'] = nodeinfo.producttype;
    nodes[nodeid]['productid'] = nodeinfo.productid;
    nodes[nodeid]['type'] = nodeinfo.type;
    nodes[nodeid]['name'] = nodeinfo.name;
    nodes[nodeid]['loc'] = nodeinfo.loc;
    nodes[nodeid]['ready'] = true;
    log.debug('node%d: %s, %s', nodeid,
            nodeinfo.manufacturer ? nodeinfo.manufacturer
                      : 'id=' + nodeinfo.manufacturerid,
            nodeinfo.product ? nodeinfo.product
                     : 'product=' + nodeinfo.productid +
                       ', type=' + nodeinfo.producttype);
    log.debug('node%d: name="%s", type="%s", location="%s"', nodeid,
            nodeinfo.name,
            nodeinfo.type,
            nodeinfo.loc);
    for (comclass in nodes[nodeid]['classes']) {
        switch (comclass) {
        case 0x25: // COMMAND_CLASS_SWITCH_BINARY
        case 0x26: // COMMAND_CLASS_SWITCH_MULTILEVEL
            zwave.enablePoll(nodeid, comclass);
            break;
        }
        var values = nodes[nodeid]['classes'][comclass];
        log.debug('node%d: class %d', nodeid, comclass);
        for (idx in values)
            log.debug('node%d:   %s=%s', nodeid, values[idx]['label'], values[idx]['value']);
    }
});

zwave.on('notification', function(nodeid, notif) {
    switch (notif) {
    case 0:
        log.debug('node%d: message complete', nodeid);
        break;
    case 1:
        log.debug('node%d: timeout', nodeid);
        break;
    case 2:
        log.debug('node%d: nop', nodeid);
        break;
    case 3:
        log.debug('node%d: node awake', nodeid);
        break;
    case 4:
        log.debug('node%d: node sleep', nodeid);
        break;
    case 5:
        log.debug('node%d: node dead', nodeid);
        break;
    case 6:
        log.debug('node%d: node alive', nodeid);
        break;
        }
});

zwave.on('scan complete', function() {
    log.debug('====> scan complete, hit ^C to finish.');
});

zwave.on('controller command', function(r,s) {
    log.debug('controller commmand feedback: r=%d, s=%d',r,s);
});

zwave.connect(DEVICE);

process.on('SIGINT', function() {
    log.debug('disconnecting...');
    zwave.disconnect(DEVICE);
    process.exit();
});

buss.on('ZWAVE_ON',function(data){
    log.debug('Got ZWAVE_ON event for id ',data);
    zwave.setNodeOn(data[0]);
    zwave.setValue(data[0], 37, 1, 0, true);
});

buss.on('ZWAVE_OFF',function(data){
    log.debug('Got ZWAVE_OFF event for id ',data);
    zwave.setNodeOff(data[0]);
    zwave.setValue(data[0], 37, 1, 0, false);
});