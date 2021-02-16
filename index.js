var _ = require('underscore');
var mqtt = require('mqtt');
var Service, Characteristic, HomebridgeAPI;

const STATE_DECREASING = 0;
const STATE_INCREASING = 1;
const STATE_STOPPED = 2;

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  HomebridgeAPI = homebridge;
  homebridge.registerAccessory('homebridge-mqtt-blinds-simulation', 'Blinds', BlindsAccessory);
}

function BlindsAccessory(log, config) {
  _.defaults(config, {durationOffset: 0, activeLow: true, reedSwitchActiveLow: true});

  this.log = log;
  this.name = config['name'];
  this.topicUp = config['topicUp'];
  this.topicDown = config['topicDown'];
  this.topicStop = config['topicStop'];
  this.durationUp = config['durationUp'];
  this.durationDown = config['durationDown'];
  this.durationOffset = config['durationOffset'];
  this.mqttUrl = config['mqttUrl'] || 'mqtt://localhost:1883';
  this.mqttUser = config['mqttUser'] || '';
  this.mqttPass = config['mqttPass'] || '';

  this.cacheDirectory = HomebridgeAPI.user.persistPath();
  this.storage = require('node-persist');
  this.storage.initSync({dir:this.cacheDirectory, forgiveParseErrors: true});

  var cachedCurrentPosition = this.storage.getItemSync(this.name);
  if((cachedCurrentPosition === undefined) || (cachedCurrentPosition === false)) {
		this.currentPosition = 0; // down by default
	} else {
		this.currentPosition = cachedCurrentPosition;
	}

  this.targetPosition = this.currentPosition;
  this.positionState = STATE_STOPPED; // stopped by default

  this.service = new Service.WindowCovering(this.name);

  this.infoService = new Service.AccessoryInformation();
  this.infoService
    .setCharacteristic(Characteristic.Manufacturer, 'Ben4523')
    .setCharacteristic(Characteristic.Model, 'MQTT Blinds')
    .setCharacteristic(Characteristic.SerialNumber, 'Version 1.0.0');

  this.finalBlindsStateTimeout;
  this.togglePinTimeout;
  this.intervalUp = this.durationUp / 100;
  this.intervalDown = this.durationDown / 100;
  this.currentPositionInterval;

    const options = {
        keepalive: 60,
        clientId: 'mqttjs_' + Math.random().toString(16).substr(2, 8),
        protocolId: 'MQTT',
        protocolVersion: 4,
        clean: true,
        reconnectPeriod: 1000,
        connectTimeout: 30 * 1000,
        will: {
        topic: 'WillMsg',
        payload: 'Connection Closed abnormally..!',
        qos: 0,
        retain: false
        },
        rejectUnauthorized: false,
        username: this.mqttUser,
        password: this.mqttPass,
    }

    this.clientMqtt = mqtt.connect(this.mqttUrl, options);

  this.service
    .getCharacteristic(Characteristic.CurrentPosition)
    .on('get', this.getCurrentPosition.bind(this));

  this.service
    .getCharacteristic(Characteristic.PositionState)
    .on('get', this.getPositionState.bind(this));

  this.service
    .getCharacteristic(Characteristic.TargetPosition)
    .on('get', this.getTargetPosition.bind(this))
    .on('set', this.setTargetPosition.bind(this));
}

BlindsAccessory.prototype.getPositionState = function(callback) {
  this.log("Position state: %s", this.positionState);
  callback(null, this.positionState);
}

BlindsAccessory.prototype.getCurrentPosition = function(callback) {
  this.log("Current position: %s", this.currentPosition);
  callback(null, this.currentPosition);
}

BlindsAccessory.prototype.getTargetPosition = function(callback) {
    this.log("Target position: %s", this.targetPosition);
  callback(null, this.targetPosition);
}

BlindsAccessory.prototype.setTargetPosition = function(position, callback) {
  this.log("Setting target position to %s", position);
  this.targetPosition = position;
  var moveUp = (this.targetPosition >= this.currentPosition);
  var duration;

  if (this.positionState != STATE_STOPPED) {
    this.log("Blind is moving, current position %s", this.currentPosition);
    if (this.oppositeDirection(moveUp)) {
      this.log('Stopping the blind because of opposite direction');
      this.sendMqtt('STOP');
    }
    clearInterval(this.currentPositionInterval);
    clearTimeout(this.finalBlindsStateTimeout);
    clearTimeout(this.togglePinTimeout);
  }

  if (this.currentPosition == position) {
    this.log('Current position already matches target position. There is nothing to do.');
    callback();
    return true;
  }

  if (moveUp) {
    duration = Math.round((this.targetPosition - this.currentPosition) / 100 * this.durationUp);
    this.currentPositionInterval = setInterval(this.setCurrentPosition.bind(this, moveUp), this.intervalUp);
  } else {
    duration = Math.round((this.currentPosition - this.targetPosition) / 100 * this.durationDown);
    this.currentPositionInterval = setInterval(this.setCurrentPosition.bind(this, moveUp), this.intervalDown);
  }

  this.log((moveUp ? 'Moving up' : 'Moving down') + ". Duration: %s ms.", duration);

  this.service.setCharacteristic(Characteristic.PositionState, (moveUp ? STATE_INCREASING : STATE_DECREASING));
  this.positionState = (moveUp ? STATE_INCREASING : STATE_DECREASING);

  this.finalBlindsStateTimeout = setTimeout(this.setFinalBlindsState.bind(this), duration);
  this.togglePin((moveUp ? 'UP' : 'DOWN'), duration);

  callback();
  return true;
}

BlindsAccessory.prototype.togglePin = function(action, duration) {
  this.sendMqtt(action);
  
  if (this.durationOffset && (this.targetPosition == 0 || this.targetPosition == 100))
    this.duration += this.durationOffset;

  if (this.targetPosition !== 0 && this.targetPosition !== 100) {
    this.togglePinTimeout = setTimeout(function() {
        this.sendMqtt('STOP');
    }.bind(this), parseInt(duration));
  }
}

BlindsAccessory.prototype.setFinalBlindsState = function() {
  clearInterval(this.currentPositionInterval);
  this.positionState = STATE_STOPPED;
  this.service.setCharacteristic(Characteristic.PositionState, STATE_STOPPED);
  this.service.setCharacteristic(Characteristic.CurrentPosition, this.targetPosition);
  this.currentPosition = this.targetPosition;
  this.storage.setItemSync(this.name, this.currentPosition);
  this.log("Successfully moved to target position: %s", this.targetPosition);
}

BlindsAccessory.prototype.setCurrentPosition = function(moveUp) {
  if (moveUp) {
    this.currentPosition++;
  } else {
    this.currentPosition--;
  }
  this.storage.setItemSync(this.name, this.currentPosition);
}

BlindsAccessory.prototype.sendMqtt = function(action) {
    switch (action) {
        case 'UP':
            this.clientMqtt.publish(this.topicUp.url, this.topicUp.message);
            break;
        case 'STOP':
            this.clientMqtt.publish(this.topicStop.url, this.topicStop.message);
            break;
        case 'DOWN':
            this.clientMqtt.publish(this.topicDown.url, this.topicDown.message);
            break;
        default:
            this.clientMqtt.publish(this.topicStop.url, this.topicStop.message);
            break;
    }
}

BlindsAccessory.prototype.oppositeDirection = function(moveUp) {
  return (this.positionState == STATE_INCREASING && !moveUp) || (this.positionState == STATE_DECREASING && moveUp);
}

BlindsAccessory.prototype.getServices = function() {
  return [this.infoService, this.service];
}
