var Service, Characteristic;
var JSONRequest = require("jsonrequest");

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory("homebridge-domotiga", "Domotiga", Domotiga);
}
//Get data from config file 
function Domotiga(log, config) {
    this.log = log;
    this.config = {
        host: config.host || 'localhost',
        port: config.port || 9090,
        service: config.service,
        device: config.device || 81,
        valueTemperature: config.valueTemperature || 1,
        valueHumidity: config.valueHumidity,
        valueBattery: config.valueBattery,
        valueContact: config.valueContact || 1,
        valueSwitch: config.valueSwitch || 1,
        name: config.name || NA,
        lowbattery: config.lowbattery
    };
}
Domotiga.prototype = {
    identify: function (callback) {
        this.log("Identify requested!");
        callback(); // success
    },
    getValueFromDomotiga: function (deviceValueNo, callback) {
        var that = this;
        JSONRequest('http://' + that.config.host + ':' + that.config.port,
                {
                    jsonrpc: "2.0",
                    method: "device.get",
                    params: { "device_id": that.config.device },
                    id: 1
                }, function (err, data) {

                    if (err) {
                        that.log("Sorry err: ", err);
                        callback(err);
                    }
                    else {
                        item = Number(deviceValueNo) - 1;
                        //that.log("data.result:", data.result);
                        //that.log( "data.result[values][0][value]", data.result[values][0][value]);
                        i = 0;
                        for (key1 in data.result) {
                            if (i == 37) {
                                //that.log("key1 ", i, key1, "values[key1]", values[key1]);
                                j = 0;
                                for (key2 in data.result[key1]) {
                                    if (j == item) {
                                        //that.log("key2 ", j, key2, "values[key1][key2]", values[key1][key2]);
                                        k = 0;
                                        for (key3 in data.result[key1][key2]) {
                                            if (k == 17) {
                                                //that.log("key3 ", k, key3, "data.result[key1][key2][key3]", data.result[key1][key2][key3]);
                                                callback(null, data.result[key1][key2][key3]);
                                            }
                                            ++k;
                                        }
                                    }
                                    ++j;
                                }
                            }
                            ++i;
                        }
                    }
                });
    },
    setValueToDomotiga: function (deviceValueNo, value, callback) {
        var that = this;

        //dbg: Message format:
        // json='application/json'
        // params='"params": {"device_id": 52, "valuenum": 1, "value": "Off"}'
        // request='{"jsonrpc": "2.0", "method": "device.set", '${params}', "id": 1}'
        // curl -sS -X POST -H "Content-Type: $json" -H "Accept: $json" -d "$request" localhost:9090

        //todo  
        JSONRequest('http://' + that.config.host + ':' + that.config.port,
                {
                    jsonrpc: "2.0",
                    method: "device.set",
                    params: { "device_id": that.config.device, "valuenum": deviceValueNo, "value": value },
                    id: 1
                }, function (err, data) {
                    //that.log("data:", data);
                    if (err) {
                        that.log("Sorry err: ", err);
                        callback(err);
                    }
                    else {
                        callback(NULL)
                    }
                });
    },
    getCurrentRelativeHumidity: function (callback) {
        var that = this;
        that.log("getting CurrentRelativeHumidity for " + that.config.name);
        that.getValueFromDomotiga(that.config.valueHumidity, function (error, result) {
            if (error) {
                that.log('CurrentRelativeHumidity GetValue failed: %s', error.message);
                callback(error);
            } else {
                callback(null, Number(result));
            }
        }.bind(this));
    },
    getCurrentTemperature: function (callback) {
        var that = this;
        that.log("getting Temperature for " + that.config.name);
        that.getValueFromDomotiga(that.config.valueTemperature, function (error, result) {
            if (error) {
                that.log('CurrentTemperature GetValue failed: %s', error.message);
                callback(error);
            } else {
                callback(null, Number(result));
            }
        }.bind(this));
    },
    getTemperatureUnits: function (callback) {
        var that = this;
        that.log("getting Temperature unit for " + that.config.name);
        // 1 = F and 0 = C
        callback(null, 0);
    },
    getGetContactState: function (callback) {
        var that = this;
        that.log("getting ContactState for " + that.config.name);
        that.getValueFromDomotiga(that.config.valueContact, function (error, result) {
            if (error) {
                that.log('getGetContactState GetValue failed: %s', error.message);
                callback(error);
            } else {
                if (result.toLowerCase() == "on") {
                    callback(null, 0);
                    //Characteristic.ContactSensorState.CONTACT_DETECTED = 0;
                }
                else {
                    callback(null, 1);
                    //Characteristic.ContactSensorState.CONTACT_NOT_DETECTED = 1;
                }
            }
        }.bind(this));
    },
    getCurrentBatteryLevel: function (callback) {
        var that = this;
        that.log("getting Battery level for " + that.config.name);
        //dbg:
        callback(null, 10);
    },
    getLowBatteryStatus: function (callback) {
        var that = this;
        that.log("getting BatteryStatus for " + that.config.name);

        that.getValueFromDomotiga(that.config.valueTemperature, function (error, result) {
            if (error) {
                that.log('BatteryStatus GetValue failed: %s', error.message);
                callback(error);
            } else {
                if (Number(result) < Number(that.config.lowbattery)) {
                    callback(null, 1);
                    //callback(null, Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW);
                }
                else {
                    callback(null, 0);
                }
            }
        }.bind(this));
    },
    getSwitchOn: function (callback) {
        var that = this;
        that.log("getting SwitchState for " + that.config.name);
        that.getValueFromDomotiga(that.config.valueSwitch, function (error, result) {
            if (error) {
                that.log('getSwitchOn GetValue failed: %s', error.message);
                callback(error);
            } else {
                if (result.toLowerCase() == "on") {
                    callback(null, 1);
                }
                else {
                    callback(null, 0);
                }
            }
        }.bind(this));
    },
    setSwitchOn: function (switchOn, callback) {
        var that = this;
        var binaryState = switchOn ? On : Off;
        that.log("Setting SwitchState for '%s' to %s", that.config.name, binaryState);

        var callbackWasCalled = false;

        that.setValueToDomotiga(that.config.valueSwitch, binaryState, function (err, result) {
            if (callbackWasCalled) {
                that.log("WARNING: setValueToDomotiga called its callback more than once! Discarding the second one.");
            }
            callbackWasCalled = true;
            if (!err) {
                that.log("Successfully set switch state on the '%s' to %s", that.config.name, binaryState);
                callback(null);
            }
            else {
                that.log("Error setting switch state to %s on the '%s'", binaryState, that.config.name);
                callback(err);
            }
        }.bind(this));
    },
    getServices: function () {
        // you can OPTIONALLY create an information service if you wish to override
        // the default values for things like serial number, model, etc.
        var informationService = new Service.AccessoryInformation();

        if (this.config.service == "TempHygroMeter") {
            informationService
                    .setCharacteristic(Characteristic.Manufacturer, "TinyTX DHT22 Manufacturer")
                    .setCharacteristic(Characteristic.Model, "TinyTX DHT22 Sensor")
                    .setCharacteristic(Characteristic.SerialNumber, ("Domotiga device " + this.config.device + this.config.name));

            var controlService = new Service.TemperatureSensor();

            controlService
                    .getCharacteristic(Characteristic.CurrentTemperature)
                    .on('get', this.getCurrentTemperature.bind(this));
            //optionals
            if (this.config.valueHumidity) {
                controlService
                        .addCharacteristic(Characteristic.CurrentRelativeHumidity)
                        .on('get', this.getCurrentRelativeHumidity.bind(this));
            }
            if (this.config.valueBattery) {
                controlService
                        .addCharacteristic(Characteristic.BatteryLevel)
                        .on('get', this.getCurrentBatteryLevel.bind(this));
            }
            if (this.config.lowbattery) {
                controlService
                        .addCharacteristic(Characteristic.StatusLowBattery)
                        .on('get', this.getLowBatteryStatus.bind(this));
            }

            return [informationService, controlService];
        }
        else if (this.config.service == "Contact") {

            informationService
                    .setCharacteristic(Characteristic.Manufacturer, "Contact Manufacturer")
                    .setCharacteristic(Characteristic.Model, "Contact Model")
                    .setCharacteristic(Characteristic.SerialNumber, ("Domotiga device " + this.config.device + this.config.name));

            var controlService = new Service.ContactSensor();

            controlService
                    .getCharacteristic(Characteristic.ContactSensorState)
                    .on('get', this.getGetContactState.bind(this));

            //optionals
            if (this.config.valueBattery) {
                controlService
                        .addCharacteristic(Characteristic.BatteryLevel)
                        .on('get', this.getCurrentBatteryLevel.bind(this));
            }
            if (this.config.lowbattery) {
                controlService
                        .addCharacteristic(Characteristic.StatusLowBattery)
                        .on('get', this.getLowBatteryStatus.bind(this));
            }
            return [informationService, controlService];
        }
        else if (this.config.service == "Switch") {
            
            informationService
                    .setCharacteristic(Characteristic.Manufacturer, "Switch Manufacturer")
                    .setCharacteristic(Characteristic.Model, "Switch Model")
                    .setCharacteristic(Characteristic.SerialNumber, ("Domotiga device " + this.config.device + this.config.name));

            var controlService = new Service.Switch(this.config.name);

            controlService
              .getCharacteristic(Characteristic.On)
              .on('get', this.getSwitchOn.bind(this))
              .on('set', this.setSwitchOn.bind(this));

            return [informationService, controlService];
        }
    }
};
