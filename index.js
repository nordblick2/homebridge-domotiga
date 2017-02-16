//"use strict";
var Accessory, Service, Characteristic, UUIDGen;
var JSONRequest = require("jsonrequest");
var inherits = require('util').inherits;
var path = require('path');
var fs = require('fs');

const exec = require('child_process').exec;	// ... for command execution
const url = require('url');					// ... for url parsing

module.exports = function (homebridge) {
    console.log("homebridge API version: " + homebridge.version);

    // Accessory must be created from PlatformAccessory Constructor
    Accessory = homebridge.platformAccessory;

    // Service and Characteristic are from hap-nodejs
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;

    ////////////////////////////// Custom characteristics //////////////////////////////
    EvePowerConsumption = function () {
        Characteristic.call(this, 'Consumption', 'E863F10D-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
            format: Characteristic.Formats.UINT16,
            unit: "watts",
            maxValue: 1000000000,
            minValue: 0,
            minStep: 1,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
        });
        this.value = this.getDefaultValue();
    };
    inherits(EvePowerConsumption, Characteristic);

    EveTotalPowerConsumption = function () {
        Characteristic.call(this, 'Total Consumption', 'E863F10C-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
            format: Characteristic.Formats.FLOAT, // Deviation from Eve Energy observed type
            unit: "kilowatthours",
            maxValue: 1000000000,
            minValue: 0,
            minStep: 0.001,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
        });
        this.value = this.getDefaultValue();
    };
    inherits(EveTotalPowerConsumption, Characteristic);

    EveRoomAirQuality = function () {
        Characteristic.call(this, 'Eve Air Quality', 'E863F10B-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
            format: Characteristic.Formats.UINT16,
            unit: "ppm",
            maxValue: 5000,
            minValue: 0,
            minStep: 1,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
        });
        this.value = this.getDefaultValue();
    };
    inherits(EveRoomAirQuality, Characteristic);

    EveBatteryLevel = function () {
        Characteristic.call(this, 'Eve Battery Level', 'E863F11B-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
            format: Characteristic.Formats.UINT16,
            unit: "PERCENTAGE",
            maxValue: 100,
            minValue: 0,
            minStep: 1,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
        });
        this.value = this.getDefaultValue();
    };
    inherits(EveBatteryLevel, Characteristic);

    EveAirPressure = function () {
        //todo: only rough guess of extreme values -> use correct min/max if known
        Characteristic.call(this, 'Eve AirPressure', 'E863F10F-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
            format: Characteristic.Formats.UINT16,
            unit: "hPa",
            maxValue: 1085,
            minValue: 870,
            minStep: 1,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
        });
        this.value = this.getDefaultValue();
    };
    inherits(EveAirPressure, Characteristic);

    ////////////////////////////// Custom services //////////////////////////////
    PowerMeterService = function (displayName, subtype) {
        Service.call(this, displayName, '00000001-0000-1777-8000-775D67EC4377', subtype);
        // Required Characteristics
        this.addCharacteristic(EvePowerConsumption);
        // Optional Characteristics
        this.addOptionalCharacteristic(EveTotalPowerConsumption);
    };
    inherits(PowerMeterService, Service);

    //Eve service (custom UUID)
    EveRoomService = function (displayName, subtype) {
        Service.call(this, displayName, 'E863F002-079E-48FF-8F27-9C2605A29F52', subtype);
        // Required Characteristics
        this.addCharacteristic(EveRoomAirQuality);
        // Optional Characteristics
        this.addOptionalCharacteristic(Characteristic.CurrentRelativeHumidity);
		this.addOptionalCharacteristic(Characteristic.CurrentTemperature);
    };
    inherits(EveRoomService, Service);

    /////////////////////////////////////////////////////////////////////////////////////////////
    //Eve service (custom UUID)
    EveWeatherService = function (displayName, subtype) {
        Service.call(this, displayName, 'E863F001-079E-48FF-8F27-9C2605A29F52', subtype);
        // Required Characteristics
        this.addCharacteristic(EveAirPressure);
        // Optional Characteristics
        this.addOptionalCharacteristic(Characteristic.CurrentRelativeHumidity);
		this.addOptionalCharacteristic(Characteristic.CurrentTemperature);
        this.addOptionalCharacteristic(EveBatteryLevel);
    };
    inherits(EveWeatherService, Service);

    // Consider platform plugin as dynamic platform plugin
    homebridge.registerPlatform("homebridge-domotiga", "DomotiGa", DomotigaPlatform, true);
}

function DomotigaPlatform(log, config, api) {
    this.log = log;
    this.config = config;
    this.log("DomotiGa Plugin Version " + this.getVersion());
	this.log("Plugin by Samfox2 https://github.com/samfox2");
	this.log("... with some additions from nordblick https://github.com/nordblick2");
    this.log("DomotiGa is a Open Source Home Automation Software for Linux");
	this.log("");
    this.log("Please report any issues to https://github.com/samfox2/homebridge-domotiga/issues");
	this.log("");

    var self = this;

    // self.fetch_npmVersion("homebridge-domotiga", function (npmVersion) {
    //     npmVersion = npmVersion.replace('\n', '');
    //     self.log("NPM %s vs Local %s", npmVersion, self.getVersion());
    //     if (npmVersion > self.getVersion()) {
    //         self.log.warn("There is a new Version available. Please update with sudo npm -g update homebridge-domotiga");
    //     }
    // });

    if (config) {

        // Global configuration
		this.disableCache = this.config.disableCache || true;
		this.debug = this.config.debug || false;

		// ------------------------------------------------------------
		// backend configuration
		// ------------------------------------------------------------
  		if ( this.config.endpoint) {
			this.backend = "endpoint";
			if (this.config.endpoint.toLowerCase() == "domotiga") {
				this.endpoint = "http://localhost:9000/";
			} else {
				this.endpoint = this.config.endpoint;
			}
			// validate endpoint with a dummy request
			self.validateEndpoint(this.endpoint,function(err,succ) {
				if ( err ) {
					self.log.error("config.json: Global endpoint probably invalid: %s (%s)",this.endpoint,err);
				}
			});
		} else if (this.config.file){
			this.backend = "file";
		} else if (this.config.command){
			this.backend = "command";
		} else {
			self.log.warn("config.json: Backend must configured in all accessories");
		}

		// ------------------------------------------------------------
        // Device specific configuration
		// ------------------------------------------------------------
        this.devices = this.config.devices || [];
        this.accessories = {};
        this.polling = {};

        if (api) {
            this.api = api;
            this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
        }
    }

}

DomotigaPlatform.prototype.validateEndpoint = function (url, callback) {
	var self = this;

	// JSONRequest throw errors in invalid url instead of returning that error in callback -> probably a bug
	try {
		JSONRequest(url,"", function(error,data) {
			if ( error)
				callback(error,false);
		} );
	}
	catch(err){
		callback("Invalid endpoint",false);
	}
}

// Method to restore accessories from cache
DomotigaPlatform.prototype.configureAccessory = function (accessory) {
	this.log("Configuring %s...", accessory.context.name);
	this.setService(accessory);
    this.accessories[accessory.context.name] = accessory;
}

// Method to setup accessories from config.json
DomotigaPlatform.prototype.didFinishLaunching = function () {

    if (!this.devices.length) {
        this.log.error("No devices configured. Please check your 'config.json' file!");
    }

    // Add or update accessories defined in config.json
    for (var i in this.devices) this.addAccessory(this.devices[i]);

	// TODO Detect config changes

    // Remove extra accessories in cache
    for (var name in this.accessories) {
        var accessory = this.accessories[name];
        if (!accessory.reachable) this.removeAccessory(accessory);
    }

    // Check number of devices
    var noD = this.accessories.length;
    this.log("Number of mapped devices : " + noD);
    if (noD > 100) {
        this.log.error("********************************************");
        this.log.error("* You are using more than 100 HomeKit      *");
        this.log.error("* devices behind a bridge. At this time    *");
        this.log.error("* HomeKit only supports up to 100 devices. *");
        this.log.error("* This may end up that iOS is not able to  *");
        this.log.error("* connect to the bridge anymore.           *");
        this.log.error("********************************************");
    } else {
        if (noD > 90) {
            this.log.warn("You are using more than 90 HomeKit");
            this.log.warn("devices behind a bridge. At this time");
            this.log.warn("HomeKit only supports up to 100 devices.");
            this.log.warn("This is just a warning. Everything should");
            this.log.warn("work fine until you are below that 100.");
        }
    }
}

// Method to add and update HomeKit accessories
DomotigaPlatform.prototype.addAccessory = function (data) {
	this.log("Initializing platform accessory '" + data.name + "'...");

    // Retrieve accessory from cache
	var accessory = this.accessories[data.name];

	if ( this.disableCache === true && this.accessories[data.name] ) {
		// remove cached accessories
		//this.removeAccessory(this.accessories[data.name],true);
		//accessory = undefined;
	}

    if (!accessory) {
		var uuid = UUIDGen.generate(data.name);

        // Setup accessory category.
        accessory = new Accessory(data.name, uuid, 8);

        // Store and initialize logfile into context
        accessory.context.name = data.name || NA;
        accessory.context.service = data.service;

        accessory.context.manufacturer = data.manufacturer;
        accessory.context.model = data.model;
		accessory.context.serial = data.serial;

		accessory.context.device = data.device;

		accessory.context.valueTemperature = data.valueTemperature;
        accessory.context.valueHumidity = data.valueHumidity;
        accessory.context.valueAirPressure = data.valueAirPressure;
        accessory.context.valueBattery = data.valueBattery;
		if ( accessory.context.valueBattery ) {
			accessory.context.batteryVoltage = data.batteryVoltage;
			accessory.context.batteryVoltageLimit = data.batteryVoltageLimit;

			if ( accessory.context.batteryVoltage && ! accessory.context.batteryVoltageLimit) {
				// set default low on 10% voltage drop (on a 3.3v sensor that are 2.97v)
				accessory.context.batteryVoltageLimit = accessory.context.batteryVoltage * 0.95;
				this.log("Setting automatic voltage limit to 95%");
			}
		}
        accessory.context.valueContact = data.valueContact;
        accessory.context.valueSwitch = data.valueSwitch;
        accessory.context.valueDoor = data.valueDoor;
        accessory.context.valueWindow = data.valueWindow;
        accessory.context.valueWindowCovering = data.valueWindowCovering;
        accessory.context.valueAirQuality = data.valueAirQuality;
       	accessory.context.valueOutlet = data.valueOutlet;
        accessory.context.valueLeakSensor = data.valueLeakSensor;
        accessory.context.valueMotionSensor = data.valueMotionSensor;
        accessory.context.valuePowerConsumption = data.valuePowerConsumption;
		accessory.context.valueLight = data.valueLight;
        accessory.context.valueTotalPowerConsumption = data.valueTotalPowerConsumption;

	    accessory.context.polling = data.polling;
        accessory.context.pollInMs = data.pollInMs || data.pollingInterval*1000 || 5000;

		// backend configuration: use default from global config
		accessory.context.backend = this.backend;
		if (data.endpoint) {
			accessory.context.backend = "endpoint";
			accessory.context.endpoint = data.endpoint;
		}

		// --> command="binary"
		if ( data.command) {
			accessory.context.backend = "command";
			accessory.context.command = data.command;
		}

		// --> file="binary"
		if ( data.file) {
			accessory.context.backend = "file";
			accessory.context.file = data.file;
			accessory.context.file_format = data.format || "json";
		}

		accessory.context.format = this.format || "plain";
		if ( data.format ) {
			accessory.context.format = data.format;
		}
		// light specific config
		accessory.context.brightness = data.brightness;
		accessory.context.color = data.color;

		// if color is enabled, we need all three properties
		if ( accessory.context.color ) {
			accessory.context.hue = true;
			accessory.context.staturation = true;
			accessory.context.brightness = true;
		}

		// data quality and validation options
		accessory.context.minTemperature = data.minTemperature;
		accessory.context.maxTemperature = data.maxTemperature;
		accessory.context.minHumidity = data.minHumidity;
		accessory.context.maxHumidity = data.maxHumidity;
		accessory.context.maxAgeInSeconds = data.maxAgeInSeconds;

        var primaryservice;

        // Setup HomeKit service(-s)
        switch (accessory.context.service) {
			case "Light":
			case "Lightbulb":
				primaryservice = new Service.Lightbulb(accessory.context.name);
				// valuelight isn't used -> using hard codes keywords for hue, saturation, brightness, state
				if (!accessory.context.valueLight) {
					this.log.warn('%s: missing definition of valueLight in config.json (ignored)!', accessory.context.name);
					//return;
				}
				break;

            case "TemperatureSensor":
                primaryservice = new Service.TemperatureSensor(accessory.context.name);
                if (!accessory.context.valueTemperature) {
                    this.log.warn('%s: missing definition of valueTemperature in config.json!', accessory.context.name);
                    //return;
                }
                break;

            case "HumiditySensor":
                primaryservice = new Service.HumiditySensor(accessory.context.name);
                if (!accessory.context.valueHumidity) {
                    this.log.warn('%s: missing definition of valueHumidity in config.json!', accessory.context.name);
                    //return;
                }
                break;

            case "Contact":
                primaryservice = new Service.ContactSensor(accessory.context.name);
                if (!accessory.context.valueContact) {
                    this.log.warn('%s: missing definition of valueContact in config.json!', accessory.context.name);
                   // return;
                }

            case "LeakSensor":
                primaryservice = new Service.LeakSensor(accessory.context.name);
                if (!accessory.context.valueLeakSensor) {
                    this.log.warn('%s: missing definition of valueLeakSensor in config.json!', accessory.context.name);
                    //return;
                }
                break;

            case "MotionSensor":
                primaryservice = new Service.MotionSensor(accessory.context.name);
                if (!accessory.context.valueMotionSensor) {
                    this.log.warn('%s: missing definition of valueMotionSensor in config.json!', accessory.context.name);
                    //return;
                }
                break;

            case "Switch":
                primaryservice = new Service.Switch(accessory.context.name);
                if (!accessory.context.valueSwitch) {
                    this.log.warn('%s: missing definition of valueSwitch in config.json!', accessory.context.name);
                    //return;
                }
                break;

            case "Door":
                primaryservice = new Service.Door(accessory.context.name);
                if (!accessory.context.valueDoor) {
                    this.log.warn('%s: missing definition of valueDoor in config.json!', accessory.context.name);
                    //return;
                }
                break;

            case "Window":
                primaryservice = new Service.Window(accessory.context.name);
                if (!accessory.context.valueWindow) {
                    this.log.warn('%s: missing definition of valueWindow in config.json!', accessory.context.name);
                    //return;
                }
                break;

            case "WindowCovering":
                primaryservice = new Service.WindowCovering(accessory.context.name);
                if (!accessory.context.valueWindowCovering) {
                    this.log.warn('%s: missing definition of valueWindowCovering in config.json!', accessory.context.name);
                    //return;
                }
                break;

            case "Outlet":
                primaryservice = new Service.Outlet(accessory.context.name);
                if (!accessory.context.valueOutlet) {
                    this.log.warn('%s: missing definition of valueOutlet in config.json!', accessory.context.name);
                    //return;
                }
                break;

            case "AirQualitySensor":
                primaryservice = new Service.AirQualitySensor(accessory.context.name);
                if (!accessory.context.valueAirQuality) {
                    this.log.warn('%s: missing definition of valueAirQuality in config.json!', accessory.context.name);
                    //return;
                }
                break;

            case "FakeEveAirQualitySensor":
                primaryservice = new EveRoomService("Eve Room");
                if (!accessory.context.valueAirQuality) {
                    this.log.warn('%s: missing definition of valueAirQuality in config.json!', accessory.context.name);
                    //return;
                }
                break;

            case "FakeEveWeatherSensor":
                primaryservice = new EveWeatherService("Eve Weather");
				this.log(typeof primaryservice);
                if (!accessory.context.valueAirPressure) {
                    this.log.warn('%s: missing definition of valueAirPressure in config.json!', accessory.context.name);
                    //return;
                }
                break;

            case "Powermeter":
                primaryservice = new PowerMeterService(accessory.context.name);
                if (!accessory.context.valuePowerConsumption) {
                    this.log.warn('%s: missing definition of valuePowerConsumption in config.json!', accessory.context.name);
                    //return;
                }
                break;
            default:
                this.log.error('Service %s %s unknown, skipping...', accessory.context.service, accessory.context.name);
                return;
                break;
        }

        // Everything outside the primary service gets added as additional characteristics...
        if (accessory.context.valueTemperature && (accessory.context.service != "TemperatureSensor")) {
            primaryservice.addOptionalCharacteristic(Characteristic.CurrentTemperature);
        }
        if (accessory.context.valueHumidity && (accessory.context.service != "HumiditySensor")) {
            primaryservice.addOptionalCharacteristic(Characteristic.CurrentRelativeHumidity);
        }
        if (accessory.context.valueBattery || accessory.context.batteryVoltage) {
            primaryservice.addOptionalCharacteristic(Characteristic.BatteryLevel);
			primaryservice.addOptionalCharacteristic(Characteristic.StatusLowBattery);
        }
        // Eve characteristic (custom UUID)
        if (accessory.context.valueAirPressure && (accessory.context.service != "FakeEveWeatherSensor")) {
            primaryservice.addOptionalCharacteristic(EveAirPressure);
        }
        // Eve characteristic (custom UUID)
        if (accessory.context.valueAirQuality && (accessory.context.service != "AirQualitySensor") && (accessory.context.service != "FakeEveAirQualitySensor")) {
            primaryservice.addOptionalCharacteristic(Characteristic.AirQuality);
        }
        // Eve characteristic (custom UUID)
        if (accessory.context.valuePowerConsumption && (accessory.context.service != "Powermeter")) {
            primaryservice.addOptionalCharacteristic(EvePowerConsumption);
        }
        // Eve characteristic (custom UUID)
        if (accessory.context.valueTotalPowerConsumption) {
            primaryservice.addOptionalCharacteristic(EveTotalPowerConsumption);
        }

        // Setup HomeKit switch service
        accessory.addService(primaryservice, data.name);

        // New accessory is always reachable
        accessory.reachable = true;

        // Setup listeners for different events
        this.setService(accessory);

        // Register accessory in HomeKit
        this.api.registerPlatformAccessories("homebridge-domotiga", "DomotiGa", [accessory]);

        // Store accessory in cache
        this.accessories[data.name] = accessory;
    }

    // Confirm variable type
    data.polling = data.polling === true;
    data.pollInMs = parseInt(data.pollInMs, 10) || 1;

    // Store and initialize variables into context
    accessory.context.cacheCurrentTemperature = 0;
    accessory.context.cacheCurrentRelativeHumidity = 99;
    accessory.context.cacheCurrentAirPressure = 1000;
    accessory.context.cacheContactSensorState = Characteristic.ContactSensorState.CONTACT_DETECTED;
    accessory.context.cacheLeakSensorState = Characteristic.LeakDetected.LEAK_NOT_DETECTED;
    accessory.context.cacheOutletState = 0;
    accessory.context.cacheOutletInUse = false;
    accessory.context.cacheCurrentAirQuality = Characteristic.AirQuality.POOR;
    accessory.context.cachePowerConsumption = 0;
    accessory.context.cacheTotalPowerConsumption = 0;
    accessory.context.cacheCurrentBatteryLevel = 0;
    accessory.context.cacheStatusLowBattery = Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    accessory.context.cacheMotionSensorState = 0;
    accessory.context.cacheSwitchState = 0;
    accessory.context.cacheDoorPosition = 0;
    accessory.context.cacheWindowPosition = 0;
    accessory.context.cacheWindowCoveringPosition = 0;

	accessory.context.cacheLightState = 0;
	accessory.context.cacheLightSaturation = 0;
	accessory.context.cacheLightHue = 0;
	accessory.context.cacheLightBrightness = 0;

	// Retrieve initial state
    this.getInitState(accessory);

    // Configure state polling
    if (data.polling) {
		this.log("Enable polling for '%s' (with %d second interval)", data.name, data.pollInMs * 1000)
		this.doPolling(data.name);
	}
}

// Function to remove accessory dynamically from outside event
DomotigaPlatform.prototype.removeAccessory = function (accessory, isConfigChange) {
    if (accessory) {
        var name = accessory.context.name;
		if ( isConfigChange ) {
			this.log("Removing accessory for re-configuring: " + name);
		} else {
        	this.log.warn("Removing accessory: " + name + ". No longer reachable or configured.");
        }
		this.api.unregisterPlatformAccessories("homebridge-domotiga", "DomotiGa", [accessory]);
        delete this.accessories[name];
    }
}

// Method to determine current state
DomotigaPlatform.prototype.doPolling = function (name) {
	if ( ! this.polling ) {
		clearTimeout(this.polling[name]);
		return;
	}
	//this.log("Polling... ");

    var accessory = this.accessories[name];
    var thisDevice = accessory.context;

    // Clear polling
    clearTimeout(this.polling[name]);

    // Get primary service
    var primaryservice;

    switch (thisDevice.service) {
		case "Light":
		case "Lightbulb":
			primaryservice = accessory.getService(Service.Lightbulb);
			this.readLightState(thisDevice, function (error, value) {
				// Update value if there's no error
				if (!error && value !== thisDevice.cacheLightState) {
					thisDevice.cacheLightState = value;
					primaryservice.getCharacteristic(Characteristic.On).getValue();
				}
			});
			if ( accessory.context.brightness || accessory.context.color  ) {
				this.readBrightnessState(thisDevice, function (error, value) {
					// Update value if there's no error
					if (!error && value !== thisDevice.cacheLightBrightness) {
						thisDevice.cacheLightBrightness = value;
						primaryservice.getCharacteristic(Characteristic.Brightness).getValue();
					}
				});
			}
			if ( accessory.context.color  ) {
				this.readHueState(thisDevice, function (error, value) {
					// Update value if there's no error
					if (!error && value !== thisDevice.cacheLightHue) {
						thisDevice.cacheLightHue = value;
						primaryservice.getCharacteristic(Characteristic.Hue).getValue();
					}
				});
				this.readSaturationState(thisDevice, function (error, value) {
					// Update value if there's no error
					if (!error && value !== thisDevice.cacheLightSaturation) {
						thisDevice.cacheLightSaturation = value;
						primaryservice.getCharacteristic(Characteristic.Saturation).getValue();
					}
				});
			}
			break;

        case "TemperatureSensor":
            primaryservice = accessory.getService(Service.TemperatureSensor);
            this.readCurrentTemperature(thisDevice, function (error, value) {
                // Update value if there's no error
                if (!error && value !== thisDevice.cacheCurrentTemperature) {
                    thisDevice.cacheCurrentTemperature = value;
                    primaryservice.getCharacteristic(Characteristic.CurrentTemperature).getValue();
                }
            });
            break;

        case "HumiditySensor":
            primaryservice = accessory.getService(Service.HumiditySensor);
            this.readCurrentRelativeHumidity(thisDevice, function (error, value) {
                // Update value if there's no error
                if (!error && value !== thisDevice.cacheCurrentRelativeHumidity) {
                    thisDevice.cacheCurrentRelativeHumidity = value;
                    primaryservice.getCharacteristic(Characteristic.CurrentRelativeHumidity).getValue();
                }
            });
            break;

        case "Contact":
            primaryservice = accessory.getService(Service.ContactSensor);
            this.readContactState(thisDevice, function (error, value) {
                // Update value if there's no error
                if (!error && value !== thisDevice.cacheContactSensorState) {
                    thisDevice.cacheContactSensorState = value;
                    primaryservice.getCharacteristic(Characteristic.cacheContactSensorState).getValue();
                }
            });
            break;

        case "LeakSensor":
            primaryservice = accessory.getService(Service.LeakSensor);
            this.readLeakSensorState(thisDevice, function (error, value) {
                // Update value if there's no error
                if (!error && value !== thisDevice.cacheLeakSensorState) {
                    thisDevice.cacheLeakSensorState = value;
                    primaryservice.getCharacteristic(Characteristic.LeakDetected).getValue();
                }
            });
            break;

        case "MotionSensor":
            primaryservice = accessory.getService(Service.MotionSensor);
            this.readMotionSensorState(thisDevice, function (error, value) {
                // Update value if there's no error
                if (!error && value !== thisDevice.cacheMotionSensorState) {
                    thisDevice.cacheMotionSensorState = value;
                    primaryservice.getCharacteristic(Characteristic.MotionDetected).getValue();
                }
            });
            break;

        case "Switch":
            primaryservice = accessory.getService(Service.Switch);
            this.readSwitchState(thisDevice, function (error, value) {
                // Update value if there's no error
                if (!error && value !== thisDevice.cacheSwitchState) {
                    thisDevice.cacheSwitchState = value;
                    primaryservice.getCharacteristic(Characteristic.On).getValue();
                }
            });
            break;

        case "Door":
            primaryservice = accessory.getService(Service.Door);
            this.readDoorPosition(thisDevice, function (error, value) {
                // Update value if there's no error
                if (!error && value !== thisDevice.cacheDoorPosition) {
                    thisDevice.cacheDoorPosition = value;
                    primaryservice.getCharacteristic(Characteristic.CurrentPosition).getValue();
                }
            });
            primaryservice.getCharacteristic(Characteristic.PositionState).getValue();
            break;

        case "Window":
            primaryservice = accessory.getService(Service.Window);
            this.readWindowPosition(thisDevice, function (error, value) {
                // Update value if there's no error
                if (!error && value !== thisDevice.cacheWindowPosition) {
                    thisDevice.cacheWindowPosition = value;
                    primaryservice.getCharacteristic(Characteristic.CurrentPosition).getValue();
                }
            });
            primaryservice.getCharacteristic(Characteristic.PositionState).getValue();
            break;

        case "WindowCovering":
            primaryservice = accessory.getService(Service.WindowCovering);
            this.readWindowCoveringPosition(thisDevice, function (error, value) {
                // Update value if there's no error
                if (!error && value !== thisDevice.cacheWindowCoveringPosition) {
                    thisDevice.cacheWindowCoveringPosition = value;
                    primaryservice.getCharacteristic(Characteristic.CurrentPosition).getValue();
                }
            });
            primaryservice.getCharacteristic(Characteristic.PositionState).getValue();
            break;

        case "Outlet":
            primaryservice = accessory.getService(Service.Outlet);
            this.readOutletState(thisDevice, function (error, value) {
                // Update value if there's no error
                if (!error && value !== thisDevice.cacheOutletState) {
                    thisDevice.cacheOutletState = value;
                    primaryservice.getCharacteristic(Characteristic.On).getValue();
                }
            });
            this.readOutletInUse(thisDevice, function (error, value) {
                // Update value if there's no error
                if (!error && value !== thisDevice.cacheOutletInUse) {
                    thisDevice.cacheOutletInUse = value;
                    primaryservice.getCharacteristic(Characteristic.OutletInUse).getValue();
                }
            });
            break;

        case "AirQualitySensor":
            primaryservice = accessory.getService(Service.AirQualitySensor);
            this.readCurrentAirQuality(thisDevice, function (error, value) {
                // Update value if there's no error
                if (!error && value !== thisDevice.cacheCurrentAirQuality) {
                    thisDevice.cacheCurrentAirQuality = value;
                    primaryservice.getCharacteristic(Characteristic.AirQuality).getValue();
                }
            });
            break;

        case "FakeEveAirQualitySensor":
            primaryservice = accessory.getService(EveRoomService);
            this.readCurrentEveAirQuality(thisDevice, function (error, value) {
                // Update value if there's no error
                if (!error && value !== thisDevice.cacheCurrentAirQuality) {
                    thisDevice.cacheCurrentAirQuality = value;
                    primaryservice.getCharacteristic(EveRoomAirQuality).getValue();
                }
            });
            break;

        case "FakeEveWeatherSensor":
            primaryservice = accessory.getService(EveWeatherService);
            this.readCurrentAirPressure(thisDevice, function (error, value) {
                // Update value if there's no error
                if (!error && value !== thisDevice.cacheCurrentAirPressure) {
                    thisDevice.cacheCurrentAirPressure = value;
                    primaryservice.getCharacteristic(EveAirPressure).getValue();
                }
            });
            break;

        case "Powermeter":
            primaryservice = accessory.getService(PowerMeterService);
            this.readEvePowerConsumption(thisDevice, function (error, value) {
                // Update value if there's no error
                if (!error && value !== thisDevice.cachePowerConsumption) {
                    thisDevice.cachePowerConsumption = value;
                    primaryservice.getCharacteristic(EvePowerConsumption).getValue();
                }
            });
            break;

        default:
            this.log.error('Service %s %s unknown, skipping...', accessory.context.service, accessory.context.name);
            break;
    }

    // Additional/optional characteristics...
    if (accessory.context.valueTemperature && (accessory.context.service != "TemperatureSensor")) {
        this.readCurrentTemperature(thisDevice, function (error, value) {
            // Update value if there's no error
            if (!error && value !== thisDevice.cacheCurrentTemperature) {
                thisDevice.cacheCurrentTemperature = value;
                primaryservice.getCharacteristic(Characteristic.CurrentTemperature).getValue();
            }
        });
    }
    if (accessory.context.valueHumidity && (accessory.context.service != "HumiditySensor")) {
        this.readCurrentRelativeHumidity(thisDevice, function (error, value) {
            // Update value if there's no error
            if (!error && value !== thisDevice.cacheCurrentRelativeHumidity) {
                thisDevice.cacheCurrentRelativeHumidity = value;
                primaryservice.getCharacteristic(Characteristic.CurrentRelativeHumidity).getValue();
            }
        });
    }
    if (accessory.context.valueBattery) {
        this.readCurrentBatteryLevel(thisDevice, function (error, value) {
            // Update value if there's no error
            if (!error && value !== thisDevice.cacheCurrentBatteryLevel) {
                thisDevice.cacheCurrentBatteryLevel = value;
                primaryservice.getCharacteristic(Characteristic.BatteryLevel).getValue();
            }
        });
    }
    if (accessory.context.batteryVoltageLimit) {
        this.readLowBatteryStatus(thisDevice, function (error, value) {
            // Update value if there's no error
            if (!error && value !== thisDevice.cacheStatusLowBattery) {
                thisDevice.cacheStatusLowBattery = value;
                primaryservice.getCharacteristic(Characteristic.StatusLowBattery).getValue();
            }
        });
    }
    // Eve characteristic (custom UUID)
    if (accessory.context.valueAirPressure &&
        (accessory.context.service != "FakeEveWeatherSensor")) {
		this.readCurrentAirPressure(thisDevice, function (error, value) {
            // Update value if there's no error
            if (!error && value !== thisDevice.cacheCurrentAirPressure) {
                thisDevice.cacheCurrentAirPressure = value;
                primaryservice.getCharacteristic(EveAirPressure).getValue();
            }
        });
    }
    // Eve characteristic (custom UUID)
    if (accessory.context.valueAirQuality &&
        (accessory.context.service != "AirQualitySensor") && (accessory.context.service != "FakeEveAirQualitySensor")) {
        this.readCurrentEveAirQuality(thisDevice, function (error, value) {
            // Update value if there's no error
            if (!error && value !== thisDevice.cacheCurrentAirQuality) {
                thisDevice.cacheCurrentAirQuality = value;
                primaryservice.getCharacteristic(Characteristic.AirQuality).getValue();
            }
        });
    }
    // Eve characteristic (custom UUID)
    if (accessory.context.valuePowerConsumption && (accessory.context.service != "Powermeter")) {
        this.readEvePowerConsumption(thisDevice, function (error, value) {
            // Update value if there's no error
            if (!error && value !== thisDevice.cachePowerConsumption) {
                thisDevice.cachePowerConsumption = value;
                primaryservice.getCharacteristic(EvePowerConsumption).getValue();
            }
        });
    }
    // Eve characteristic (custom UUID)
    if (accessory.context.valueTotalPowerConsumption) {
        this.readEveTotalPowerConsumption(thisDevice, function (error, value) {
            // Update value if there's no error
            if (!error && value !== thisDevice.cacheTotalPowerConsumption) {
                thisDevice.cacheTotalPowerConsumption = value;
                primaryservice.getCharacteristic(EveTotalPowerConsumption).getValue();
            }
        });
    }

    // Setup for next polling
    this.polling[name] = setTimeout(this.doPolling.bind(this), thisDevice.pollInMs, name);

}

// Method to setup listeners for different events
DomotigaPlatform.prototype.setService = function (accessory) {

    var primaryservice;

    // Setup HomeKit service(-s)
    switch (accessory.context.service) {
		case "Light":
		case "Lightbulb":
			primaryservice = accessory.getService(Service.Lightbulb);
			primaryservice.getCharacteristic(Characteristic.On)
				.on('get', this.getLightState.bind(this, accessory.context))
				.on('set', this.setLightState.bind(this, accessory.context));
			if ( accessory.context.color) {
				primaryservice.getCharacteristic(Characteristic.Hue)
					.on('get', this.getLightHue.bind(this, accessory.context))
					.on('set', this.setLightHue.bind(this, accessory.context));
				primaryservice.getCharacteristic(Characteristic.Saturation)
					.on('get', this.getLightSaturation.bind(this, accessory.context))
					.on('set', this.setLightSaturation.bind(this, accessory.context));
			}
			if ( accessory.context.brightness || accessory.context.color ) {
				primaryservice.getCharacteristic(Characteristic.Brightness)
					.on('get', this.getLightBrightness.bind(this, accessory.context))
					.on('set', this.setLightBrightness.bind(this, accessory.context));
			}
			break;

        case "TemperatureSensor":
			var minVal = -55;
			var maxVal = 100;
			if ( accessory.context.minTemperature ) {
				this.log("Overwriting default minTemperature (%d => %d)",minVal,accessory.context.minTemperature);
				minVal = accessory.context.minTemperature;
			}
			if ( accessory.context.minTemperature ) {
				this.log("Overwriting default maxTemperature (%d => %d)",maxVal,accessory.context.maxTemperature);
				maxVal = accessory.context.maxTemperature;
			}
            primaryservice = accessory.getService(Service.TemperatureSensor);
            primaryservice.getCharacteristic(Characteristic.CurrentTemperature)
                .setProps({ minValue: minVal, maxValue: maxVal })
                .on('get', this.getCurrentTemperature.bind(this, accessory.context));
            break;

        case "HumiditySensor":
			var minVal = 0;
			var maxVal = 100;
			if ( accessory.context.minHumidity ) {
				this.log("Overwriting default minHumidity (%d => %d)",minVal,accessory.context.minHumidity);
				minVal = accessory.context.minTemperature;
			}
			if ( accessory.context.minHumidity ) {
				this.log("Overwriting default maxHumidit (%d => %d)",maxVal,accessory.context.maxHumidity);
				maxVal = accessory.context.maxHumidity;
			}
		    primaryservice = accessory.getService(Service.HumiditySensor);
            primaryservice.getCharacteristic(Characteristic.CurrentRelativeHumidity)
                .setProps({ minValue: minVal, maxValue: maxVal })
				.on('get', this.getCurrentRelativeHumidity.bind(this, accessory.context));
            break;

        case "Contact":
            primaryservice = accessory.getService(Service.ContactSensor);
            primaryservice.getCharacteristic(Characteristic.ContactSensorState)
                .on('get', this.getContactState.bind(this, accessory.context));
			break;

        case "LeakSensor":
            primaryservice = accessory.getService(Service.LeakSensor);
            primaryservice.getCharacteristic(Characteristic.LeakDetected)
                .on('get', this.getLeakSensorState.bind(this, accessory.context));
            break;

        case "MotionSensor":
            primaryservice = accessory.getService(Service.MotionkSensor);
            primaryservice.getCharacteristic(Characteristic.MotionDetected)
                .on('get', this.getMotionSensorState.bind(this, accessory.context));
            break;

        case "Switch":
            primaryservice = accessory.getService(Service.Switch);
            primaryservice.getCharacteristic(Characteristic.On)
                .on('get', this.getSwitchState.bind(this, accessory.context))
                .on('set', this.setSwitchState.bind(this, accessory.context))
            break;

        case "Door":
            primaryservice = accessory.getService(Service.Door);
            primaryservice.getCharacteristic(Characteristic.CurrentPosition)
                .on('get', this.getDoorPosition.bind(this, accessory.context))
            primaryservice.getCharacteristic(Characteristic.TargetPosition)
                .on('get', this.getDoorPosition.bind(this, accessory.context))
                .on('set', this.setDoorPosition.bind(this, accessory.context))
            primaryservice.getCharacteristic(Characteristic.PositionState)
                .on('get', this.getDoorPositionState.bind(this, accessory.context))
            break;

        case "Window":
            primaryservice = accessory.getService(Service.Window);
            primaryservice.getCharacteristic(Characteristic.CurrentPosition)
                .on('get', this.getWindowPosition.bind(this, accessory.context))
            primaryservice.getCharacteristic(Characteristic.TargetPosition)
                .on('get', this.getWindowPosition.bind(this, accessory.context))
                .on('set', this.setWindowPosition.bind(this, accessory.context))
            primaryservice.getCharacteristic(Characteristic.PositionState)
                .on('get', this.getWindowPositionState.bind(this, accessory.context))
            break;

        case "WindowCovering":
            primaryservice = accessory.getService(Service.WindowCovering);
            primaryservice.getCharacteristic(Characteristic.CurrentPosition)
                .on('get', this.getWindowCoveringPosition.bind(this, accessory.context))
            primaryservice.getCharacteristic(Characteristic.TargetPosition)
                .on('get', this.getWindowCoveringPosition.bind(this, accessory.context))
                .on('set', this.setWindowCoveringPosition.bind(this, accessory.context))
            primaryservice.getCharacteristic(Characteristic.PositionState)
                .on('get', this.getWindowCoveringPositionState.bind(this, accessory.context))
            break;

        case "Outlet":
            primaryservice = accessory.getService(Service.Outlet);
            primaryservice.getCharacteristic(Characteristic.On)
                .on('get', this.getOutletState.bind(this, accessory.context))
                .on('set', this.setOutletState.bind(this, accessory.context));
            primaryservice.getCharacteristic(Characteristic.OutletInUse)
                    .on('get', this.getOutletInUse.bind(this, accessory.context));
            break;

        case "AirQualitySensor":
            primaryservice = accessory.getService(Service.AirQualitySensor);
            primaryservice.getCharacteristic(Characteristic.AirQuality)
                .on('get', this.getCurrentAirQuality.bind(this, accessory.context));
            break;

        case "FakeEveAirQualitySensor":
			primaryservice = new EveRoomService(accessory.context.name);
            //primaryservice = accessory.getService(EveRoomService);
            primaryservice.getCharacteristic(EveRoomAirQuality)
                .on('get', this.getCurrentEveAirQuality.bind(this, accessory.context));
            break;

        case "FakeEveWeatherSensor":
			primaryservice = accessory.getService(EveWeatherService);
			//primaryservice = new EveWeatherService(accessory.context.name);
            primaryservice.getCharacteristic(EveAirPressure)
               .on('get', this.getCurrentAirPressure.bind(this, accessory.context));
            break;

        case "Powermeter":
            primaryservice = accessory.getService(PowerMeterService);
            primaryservice.getCharacteristic(EvePowerConsumption)
                .on('get', this.getEvePowerConsumption.bind(this, accessory.context));
            break;

        default:
            this.log.error('Service %s %s unknown, skipping...', accessory.context.service, accessory.context.name);
            break;
    }

    // Everything outside the primary service gets added as additional characteristics...
    if (primaryservice) {
        if (accessory.context.valueTemperature && (accessory.context.service != "TemperatureSensor")) {
			var minVal = -55;
			var maxVal = 100;
			if (accessory.context.minTemperature) {
				this.log("%s: Overwriting minValue (%d => %d)",accessory.context.name, minVal, accessory.context.minTemperature);
				minVal = accessory.context.minTemperature;
			}
			if (accessory.context.maxTemperature) {
				this.log("%s: Overwriting maxValue (%d => %d)",accessory.context.name, maxVal, accessory.context.maxTemperature);
				maxVal = accessory.context.maxTemperature;
			}
			primaryservice.getCharacteristic(Characteristic.CurrentTemperature)
                .setProps({ minValue: minVal, maxValue: maxVal })
                .on('get', this.getCurrentTemperature.bind(this, accessory.context));
        }
        if (accessory.context.valueHumidity && (accessory.context.service != "HumiditySensor")) {
			var minVal = 0;
			var maxVal = 100;
			if (accessory.context.minHumidity) {
				this.log("%s: Overwriting minHumidityValue (%d => %d)",accessory.context.name, minVal,accessory.context.min);
				minVal = accessory.context.minHumidity;
			}
			if (accessory.context.maxHumidity) {
				this.log("%s: Overwriting maxHumidityValue (%d => %d)",accessory.context.name, maxVal,accessory.context.maxHumidity);
				maxVal = accessory.context.maxHumidity;
			}
            primaryservice.getCharacteristic(Characteristic.CurrentRelativeHumidity)
				.setProps({ minValue: minVal, maxValue: maxVal })
                .on('get', this.getCurrentRelativeHumidity.bind(this, accessory.context));
        }
        if (accessory.context.batteryVoltage) {
            primaryservice.getCharacteristic(Characteristic.BatteryLevel)
                .on('get', this.getCurrentBatteryLevel.bind(this, accessory.context));
        }
        if (accessory.context.batteryVoltageLimit) {
            primaryservice.getCharacteristic(Characteristic.StatusLowBattery)
                .on('get', this.getLowBatteryStatus.bind(this, accessory.context));
        }
        // Eve characteristic (custom UUID)
        if (accessory.context.valueAirPressure && (accessory.context.service != "FakeEveWeatherSensor")) {
			this.log(primaryservice);
			primaryservice.getCharacteristic(DomotigaPlatform.EveAirPressure)
                 .on('get', this.getCurrentAirPressure.bind(this, accessory.context));
        }
        // Eve characteristic (custom UUID)
        if (accessory.context.valueAirQuality &&
            (accessory.context.service != "AirQualitySensor") && (accessory.context.service != "FakeEveAirQualitySensor")) {
            primaryservice.getCharacteristic(Characteristic.AirQuality)
                .on('get', this.getCurrentEveAirQuality.bind(this, accessory.context));
        }
        // Eve characteristic (custom UUID)
        if (accessory.context.valuePowerConsumption && (accessory.context.service != "Powermeter")) {
            primaryservice.getCharacteristic(EvePowerConsumption)
                .on('get', this.getEvePowerConsumption.bind(this, accessory.context));
        }
        // Eve characteristic (custom UUID)
        if (accessory.context.valueTotalPowerConsumption) {
            primaryservice.getCharacteristic(EveTotalPowerConsumption)
                .on('get', this.getEveTotalPowerConsumption.bind(this, accessory.context));
        }
    }
    accessory.on('identify', this.identify.bind(this, accessory.context));
}

// Initialize accessory
DomotigaPlatform.prototype.getInitState = function (accessory) {

    // Update HomeKit accessory information
    accessory.getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.Manufacturer, accessory.context.manufacturer || "(not set)")
        .setCharacteristic(Characteristic.Model, accessory.context.model || "(not set)")
        .setCharacteristic(Characteristic.SerialNumber, accessory.context.serial || "(not set)");

    // Retrieve initial state if polling is disabled
    if (!accessory.context.polling) {

        // Get primary service
        var primaryservice;

        switch (accessory.context.service) {
			case "Light":
			case "Lightbulb":
				primaryservice = accessory.getService(Service.Lightbulb);
				if ( accessory.context.color ) {
					primaryservice.getCharacteristic(Characteristic.Hue).getValue();
					primaryservice.getCharacteristic(Characteristic.Saturation).getValue();
				}
				if ( accessory.context.color || accessory.context.brightness ) {
					primaryservice.getCharacteristic(Characteristic.Brightness).getValue();
				}

				break;

            case "TemperatureSensor":
                primaryservice = accessory.getService(Service.TemperatureSensor);
                primaryservice.getCharacteristic(Characteristic.CurrentTemperature).getValue();
                break;

            case "HumiditySensor":
                primaryservice = accessory.getService(Service.HumiditySensor);
                primaryservice.getCharacteristic(Characteristic.CurrentRelativeHumidity).getValue();
                break;


            case "Contact":
                primaryservice = accessory.getService(Service.ContactSensor);
                primaryservice.getCharacteristic(Characteristic.ContactSensorState).getValue();
                break;


            case "LeakSensor":
                primaryservice = accessory.getService(Service.LeakSensor);
                primaryservice.getCharacteristic(Characteristic.LeakDetected).getValue();
                break;


            case "MotionSensor":
                primaryservice = accessory.getService(Service.MotionSensor);
                primaryservice.getCharacteristic(Characteristic.MotionDetected).getValue();
                break;


            case "Switch":
                primaryservice = accessory.getService(Service.Switch);
                primaryservice.getCharacteristic(Characteristic.On).getValue();
                break;

            case "Door":
                primaryservice = accessory.getService(Service.Door);
                primaryservice.getCharacteristic(Characteristic.CurrentPosition).getValue();
                primaryservice.getCharacteristic(Characteristic.PositionState).getValue();
                break;

            case "Window":
                primaryservice = accessory.getService(Service.Window);
                primaryservice.getCharacteristic(Characteristic.CurrentPosition).getValue();
                primaryservice.getCharacteristic(Characteristic.PositionState).getValue();
                break;

            case "WindowCovering":
                primaryservice = accessory.getService(Service.WindowCovering);
                primaryservice.getCharacteristic(Characteristic.CurrentPosition).getValue();
                primaryservice.getCharacteristic(Characteristic.PositionState).getValue();
                break;

            case "Outlet":
                primaryservice = accessory.getService(Service.Outlet);
                primaryservice.getCharacteristic(Characteristic.On).getValue();
                primaryservice.getCharacteristic(Characteristic.OutletInUse).getValue();
                break;

            case "AirQualitySensor":
                primaryservice = accessory.getService(Service.AirQualitySensor);
                primaryservice.getCharacteristic(Characteristic.AirQuality).getValue();
                break;

            case "FakeEveAirQualitySensor":
                primaryservice = accessory.getService(EveRoomService);
                primaryservice.getCharacteristic(EveRoomAirQuality).getValue();
                break;

            case "FakeEveWeatherSensor":
                primaryservice = accessory.getService(EveWeatherService);
                primaryservice.getCharacteristic(EveAirPressure).getValue();
                break;

            case "Powermeter":
                primaryservice = accessory.getService(PowerMeterService);
                primaryservice.getCharacteristic(EvePowerConsumption).getValue();
                break;

            default:
                this.log.error('Service %s %s unknown, skipping...', accessory.context.service, accessory.context.name);
                break;
        }

        // Additional/optional characteristics...
        if (primaryservice) {
            if (accessory.context.valueTemperature && (accessory.context.service != "TemperatureSensor")) {
                primaryservice.getCharacteristic(Characteristic.CurrentTemperature).getValue();
            }
            if (accessory.context.valueHumidity && (accessory.context.service != "HumiditySensor")) {
                primaryservice.getCharacteristic(Characteristic.CurrentRelativeHumidity).getValue();
            }
            if (accessory.context.valueBattery) {
                primaryservice.getCharacteristic(Characteristic.BatteryLevel).getValue();
            }
            if (accessory.context.lowbattery) {
                primaryservice.getCharacteristic(Characteristic.StatusLowBattery).getValue();
            }
            // Eve characteristic (custom UUID)
            if (accessory.context.valueAirPressure &&
                (accessory.context.service != "FakeEveWeatherSensor")) {
                primaryservice.getCharacteristic(EveAirPressure).getValue();
            }
            // Eve characteristic (custom UUID)
            if (accessory.context.valueAirQuality &&
                (accessory.context.service != "AirQualitySensor") && (accessory.context.service != "FakeEveAirQualitySensor")) {
                primaryservice.getCharacteristic(Characteristic.AirQuality).getValue();
            }
            // Eve characteristic (custom UUID)
            if (accessory.context.valuePowerConsumption && (accessory.context.service != "Powermeter")) {
                primaryservice.getCharacteristic(EvePowerConsumption).getValue();
            }
            // Eve characteristic (custom UUID)
            if (accessory.context.valueTotalPowerConsumption) {
                primaryservice.getCharacteristic(EveTotalPowerConsumption).getValue();
            }
        }
    }

    // Configured accessory is reachable
    accessory.updateReachability(true);
}

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------




// -----------------------------------------------------------------------------
// TEMPERATURE & HUMIDITY CONTROL
// -----------------------------------------------------------------------------

DomotigaPlatform.prototype.readCurrentTemperature = function (thisDevice, callback) {
    var self = this;
    self.log("%s: getting temperature...", thisDevice.name);

    this.domotigaGetValue(thisDevice, thisDevice.valueTemperature, function (error, result) {
        if (error) {
            self.log.error('%s: readCurrentTemperature failed: %s', thisDevice.name, error.message);
            callback(error);
        } else {
            var value = Number(result);
            self.log('%s: temperature: %s', thisDevice.name, value);
            callback(null, value);
        }
    });
}

// Method to determine current temperature
DomotigaPlatform.prototype.getCurrentTemperature = function (thisDevice, callback) {
    var self = this;

    if (thisDevice.polling) {
        // Get value directly from cache if polling is enabled
        self.log('%s: cached temperature is: %s', thisDevice.name, thisDevice.cacheCurrentTemperature);
        callback(null, thisDevice.cacheCurrentTemperature);
    } else {
        // Check value if polling is disabled
        this.readCurrentTemperature(thisDevice, function (error, value) {
            // Update cache
            thisDevice.cacheCurrentTemperature = value;
            callback(error, thisDevice.cacheCurrentTemperature);
        });
    }
}

DomotigaPlatform.prototype.readCurrentRelativeHumidity = function (thisDevice, callback) {
    var self = this;
    self.log("%s: getting relative humidity...", thisDevice.name);

    self.domotigaGetValue(thisDevice, thisDevice.valueHumidity, function (error, result) {
        if (error) {
            self.log.error('%s: readCurrentRelativeHumidity failed: %s', thisDevice.name, error.message);
            callback(error);
        } else {
            var value = Number(result);
            self.log('%s: relative humidity: %s', thisDevice.name, value);
            callback(null, value);
        }
    });
}

// Method to determine current relative humidity
DomotigaPlatform.prototype.getCurrentRelativeHumidity = function (thisDevice, callback) {
    var self = this;

    if (thisDevice.polling) {
        // Get value directly from cache if polling is enabled
        self.log('%s: cached relative humidity is: %s', thisDevice.name, thisDevice.cacheCurrentRelativeHumidity);
        callback(null, thisDevice.cacheCurrentRelativeHumidity);
    } else {
        // Check value if polling is disabled
        self.readCurrentRelativeHumidity(thisDevice, function (error, value) {
            // Update cache
            thisDevice.cacheCurrentRelativeHumidity = value;
            callback(error, thisDevice.cacheCurrentRelativeHumidity);
        });
    }
}

DomotigaPlatform.prototype.getTemperatureUnits = function (thisDevice, callback) {
    this.log("%s: getting temperature unit...", thisDevice.name);
    // 1 = F and 0 = C
    callback(null, 0);
}

// -----------------------------------------------------------------------------
// AIR PRESSURE CONTROL
// -----------------------------------------------------------------------------

DomotigaPlatform.prototype.readCurrentAirPressure = function (thisDevice, callback) {
    var self = this;
    self.log("%s: getting air pressure...", thisDevice.name);

    this.domotigaGetValue(thisDevice, thisDevice.valueAirPressure, function (error, result) {
        if (error) {
            self.log.error('%s: readCurrentAirPressure failed: %s', thisDevice.name, error.message);
            callback(error);
        } else {
            var value = Number(result);
            self.log('%s: air pressure: %s', thisDevice.name, value);
            callback(null, value);
        }
    });
}

DomotigaPlatform.prototype.getCurrentAirPressure = function (thisDevice, callback) {
    var self = this;

    if (thisDevice.polling) {
        // Get value directly from cache if polling is enabled
        self.log('%s: Cached air pressure is: %s', thisDevice.name, thisDevice.cacheCurrentAirPressure);
        callback(null, thisDevice.cacheCurrentAirPressure);
    } else {
        // Check value if polling is disabled
        this.readCurrentAirPressure(thisDevice, function (error, value) {
            // Update cache
            thisDevice.cacheCurrentAirPressure = value;
            callback(error, thisDevice.cacheCurrentAirPressure);
        });
    }
}

// -----------------------------------------------------------------------------
// CONTACT CONTROL
// -----------------------------------------------------------------------------

DomotigaPlatform.prototype.readContactState = function (thisDevice, callback) {
    var self = this;
    self.log("%s: getting contact state...", thisDevice.name);

    this.domotigaGetValue(thisDevice, thisDevice.valueContact, function (error, result) {
        if (error) {
            self.log.error('%s: readContactState failed: %s', thisDevice.name, error.message);
            callback(error);
        } else {
            var value = (result.toLowerCase() == "on" || result==1) ? Characteristic.ContactSensorState.CONTACT_DETECTED : ContactSensorState.CONTACT_NOT_DETECTED;

            self.log('%s: contact state: %s', thisDevice.name, value);
            callback(null, value);
        }
    });
}

DomotigaPlatform.prototype.getContactState = function (thisDevice, callback) {
    var self = this;

    if (thisDevice.polling) {
        // Get value directly from cache if polling is enabled
        self.log('%s: cached contact state is: %s', thisDevice.name, thisDevice.cacheContactSensorState);
        callback(null, thisDevice.cacheContactSensorState);
    } else {
        // Check value if polling is disabled
        this.readContactState(thisDevice, function (error, value) {
            // Update cache
            thisDevice.cacheContactSensorState = value;
            callback(error, thisDevice.cacheContactSensorState);
        });
    }
}

// -----------------------------------------------------------------------------
// LEAK SENSOR CONTROL
// -----------------------------------------------------------------------------

DomotigaPlatform.prototype.readLeakSensorState = function (thisDevice, callback) {
    var self = this;
    self.log("%s: getting leaksensor state...", thisDevice.name);

    this.domotigaGetValue(thisDevice, thisDevice.valueLeakSensor, function (error, result) {
        if (error) {
            self.log.error('%s: readLeakSensorState failed: %s', thisDevice.name, error.message);
            callback(error);
        } else {
            var value = (Number(result) == 0) ? Characteristic.LeakDetected.LEAK_NOT_DETECTED : Characteristic.LeakDetected.LEAK_DETECTED;

            self.log('%s: leaksensor state: %s', thisDevice.name, value);
            callback(null, value);
        }
    });
}

DomotigaPlatform.prototype.getLeakSensorState = function (thisDevice, callback) {
    var self = this;

    if (thisDevice.polling) {
        // Get value directly from cache if polling is enabled
        self.log('%s: cached leaksensor state is: %s', thisDevice.name, thisDevice.cacheLeakSensorState);
        callback(null, thisDevice.cacheLeakSensorState);
    } else {
        // Check value if polling is disabled
        this.readLeakSensorState(thisDevice, function (error, value) {
            // Update cache
            thisDevice.cacheLeakSensorState = value;
            callback(error, thisDevice.cacheLeakSensorState);
        });
    }
}

// -----------------------------------------------------------------------------
// OUTLET CONTROL
// -----------------------------------------------------------------------------

DomotigaPlatform.prototype.readOutletState = function (thisDevice, callback) {
    var self = this;
    self.log("%s: getting outlet state...", thisDevice.name);

    this.domotigaGetValue(thisDevice, thisDevice.valueOutlet, function (error, result) {
        if (error) {
            self.log.error('%s: readOutletState failed: %s', thisDevice.name, error.message);
            callback(error);
        } else {
            var value = result;
            self.log('%s: outlet state: %s', thisDevice.name, value);
            callback(null, value);
        }
    });
}

DomotigaPlatform.prototype.getOutletState = function (thisDevice, callback) {
    var self = this;

    if (thisDevice.polling) {
        // Get value directly from cache if polling is enabled
        self.log('%s: cached outlet state is: %s', thisDevice.name, thisDevice.cacheOutletState);
        callback(null, thisDevice.cacheOutletState);
    } else {
        // Check value if polling is disabled
        this.readOutletState(thisDevice, function (error, value) {
            // Update cache
            thisDevice.cacheOutletState = value;
            callback(error, thisDevice.cacheOutletState);
        });
    }
}

DomotigaPlatform.prototype.setOutletState = function (thisDevice, boolvalue, callback) {
    var self = this;
    self.log("%s: Setting outlet state to %s", thisDevice.name, boolvalue);

    thisDevice.cacheOutletState = boolvalue;

    var OnOff = (boolvalue == 1) ? "On" : "Off";

    var callbackWasCalled = false;
    this.domotigaSetValue(thisDevice, thisDevice.valueOutlet, OnOff, function (err) {
        if (callbackWasCalled)
            self.log.warn("WARNING: domotigaSetValue called its callback more than once! Discarding the second one.");

        callbackWasCalled = true;
        if (!err) {
            self.log("%s: successfully set outlet state to %s", thisDevice.name, OnOff);
            callback(null);
        } else {
            self.log.error("%s: error setting outlet state to %s", thisDevice.name, OnOff);
            callback(err);
        }
    });
}

DomotigaPlatform.prototype.readOutletInUse = function (thisDevice, callback) {
    var self = this;
    self.log("%s: getting outletInUse...", thisDevice.name);

    this.domotigaGetValue(thisDevice, thisDevice.valueOutlet, function (error, result) {
        if (error) {
            self.log.error('%s: readOutletInUse failed: %s', thisDevice.name, error.message);
            callback(error);
        } else {
            self.log('%s: OutletInUse: %s', thisDevice.name, result);
            callback(null, result);
        }
    });
}

DomotigaPlatform.prototype.getOutletInUse = function (thisDevice, callback) {
    var self = this;

    if (thisDevice.polling) {
        // Get value directly from cache if polling is enabled
        self.log('%s: cached OutletInUse is: %s', thisDevice.name, thisDevice.cacheOutletInUse);
        callback(null, thisDevice.cacheOutletInUse);
    } else {
        // Check value if polling is disabled
        this.readOutletInUse(thisDevice, function (error, value) {
            // Update cache
            thisDevice.cacheOutletInUse = value;
            callback(error, thisDevice.cacheOutletInUse);
        });
    }
}

// -----------------------------------------------------------------------------
// AIR QUALITY CONTROL
// -----------------------------------------------------------------------------

DomotigaPlatform.prototype.readCurrentAirQuality = function (thisDevice, callback) {
    var self = this;
    self.log("%s: getting air quality...", thisDevice.name);

    this.domotigaGetValue(thisDevice, thisDevice.valueAirQuality, function (error, result) {
        if (error) {
            self.log.error('%s: readCurrentAirQuality failed: %s', thisDevice.name, error.message);
            callback(error);
        } else {
            voc = Number(result);
            self.log('%s: current air quality level: %s', thisDevice.name, voc);

            var value;

            if (voc > 1500)
                value = Characteristic.AirQuality.POOR;
            else if (voc > 1000)
                value = Characteristic.AirQuality.INFERIOR;
            else if (voc > 800)
                value = Characteristic.AirQuality.FAIR;
            else if (voc > 600)
                value = Characteristic.AirQuality.GOOD;
            else if (voc > 0)
                value = Characteristic.AirQuality.EXCELLENT;
            else
                value = Characteristic.AirQuality.UNKNOWN;

            self.log('%s: current air quality: %s', thisDevice.name, value);
            callback(null, value);
        }
    });
}

DomotigaPlatform.prototype.getCurrentAirQuality = function (thisDevice, callback) {
    var self = this;

    if (thisDevice.polling) {
        // Get value directly from cache if polling is enabled
        self.log('%s: cached air quality is: %s', thisDevice.name, thisDevice.cacheCurrentAirQuality);
        callback(null, thisDevice.cacheCurrentAirQuality);
    } else {
        // Check value if polling is disabled
        this.readCurrentAirQuality(thisDevice, function (error, value) {
            // Update cache
            thisDevice.cacheCurrentAirQuality = value;
            callback(error, thisDevice.cacheCurrentAirQuality);
        });
    }
}

// Eve characteristic (custom UUID)
DomotigaPlatform.prototype.readCurrentEveAirQuality = function (thisDevice, callback) {
    // Custom Eve intervals:
    //    0... 700 : Exzellent
    //  700...1100 : Good
    // 1100...1600 : Acceptable
    // 1600...2000 : Moderate
    //      > 2000 : Bad
    var self = this;
    self.log("%s: getting Eve air quality...", thisDevice.name);

    this.domotigaGetValue(thisDevice, thisDevice.valueAirQuality, function (error, result) {
        if (error) {
            self.log.error('%s: readCurrentEveAirQuality failed: %s', thisDevice.name, error.message);
            callback(error);
        } else {
            var value = Number(result);
            if (value < 0)
                value = 0;

            self.log('%s: Eve air quality: %s', thisDevice.name, value);
            callback(null, value);
        }
    });
}

DomotigaPlatform.prototype.getCurrentEveAirQuality = function (thisDevice, callback) {
    var self = this;

    if (thisDevice.polling) {
        // Get value directly from cache if polling is enabled
        self.log('%s: cached Eve air quality is: %s', thisDevice.name, thisDevice.cacheCurrentAirQuality);
        callback(null, thisDevice.cacheCurrentAirQuality);
    } else {
        // Check value if polling is disabled
        this.readCurrentEveAirQuality(thisDevice, function (error, value) {
            // Update cache
            thisDevice.cacheCurrentAirQuality = value;
            callback(error, thisDevice.cacheCurrentAirQuality);
        });
    }
}

// Eve characteristic (custom UUID)
DomotigaPlatform.prototype.readEvePowerConsumption = function (thisDevice, callback) {
    var self = this;
    self.log("%s: getting Eve power consumption...", thisDevice.name);

    this.domotigaGetValue(thisDevice, thisDevice.valueOutlet, function (error, result) {
        if (error) {
            self.log.error('%s: readEvePowerConsumption failed: %s', thisDevice.name, error.message);
            callback(error);
        } else {
            var value = Math.round(Number(result)); // W

            self.log('%s: Eve power consumption: %s', thisDevice.name, value);
            callback(null, value);
        }
    });
}

DomotigaPlatform.prototype.getEvePowerConsumption = function (thisDevice, callback) {
    var self = this;

    if (thisDevice.polling) {
        // Get value directly from cache if polling is enabled
        self.log('%s: cached Eve power consumption is: %s', thisDevice.name, thisDevice.cachePowerConsumption);
        callback(null, thisDevice.cachePowerConsumption);
    } else {
        // Check value if polling is disabled
        this.readEvePowerConsumption(thisDevice, function (error, value) {
            // Update cache
            thisDevice.cachePowerConsumption = value;
            callback(error, thisDevice.cachePowerConsumption);
        });
    }
}

// Eve characteristic (custom UUID)
DomotigaPlatform.prototype.readEveTotalPowerConsumption = function (thisDevice, callback) {
    var self = this;
    self.log("%s: getting Eve total power consumption...", thisDevice.name);

    this.domotigaGetValue(thisDevice, thisDevice.valueOutlet, function (error, result) {
        if (error) {
            self.log.error('%s: readEveTotalPowerConsumption failed: %s', thisDevice.name, error.message);
            callback(error);
        } else {
            var value = Math.round(Number(result) * 1000.0) / 1000.0; // kWh

            self.log('%s: Eve total power consumption: %s', thisDevice.name, value);
            callback(null, value);
        }
    });
}

DomotigaPlatform.prototype.getEveTotalPowerConsumption = function (thisDevice, callback) {
    var self = this;

    if (thisDevice.polling) {
        // Get value directly from cache if polling is enabled
        self.log('%s: cached Eve total power consumption is: %s', thisDevice.name, thisDevice.cacheTotalPowerConsumption);
        callback(null, thisDevice.cacheTotalPowerConsumption);
    } else {
        // Check value if polling is disabled
        this.readEveTotalPowerConsumption(thisDevice, function (error, value) {
            // Update cache
            thisDevice.cacheTotalPowerConsumption = value;
            callback(error, thisDevice.cacheTotalPowerConsumption);
        });
    }
}

// -----------------------------------------------------------------------------
// BATTERY CONTROL
// -----------------------------------------------------------------------------

DomotigaPlatform.prototype.readCurrentBatteryLevel = function (thisDevice, callback) {
    var self = this;
    self.log("%s: getting battery level...", thisDevice.name);

    this.domotigaGetValue(thisDevice, thisDevice.valueBattery, function (error, result) {
        if (error) {
            self.log.error('%s: readCurrentBatteryLevel failed: %s', thisDevice.name, error.message);
            callback(error);
        } else {
            thisDevice.lastBatteryLevel = (Number(result));
            var value = parseInt(thisDevice.lastBatteryLevel * 100 / thisDevice.batteryVoltage, 10);
            if (value > 100)
                value = 100;
            else if (value < 0)
                value = 0;

            self.log('%s: current battery level: %s%% (Voltage: %s)', thisDevice.name, value, thisDevice.lastBatteryLevel);
            callback(null, value);
        }
    });
}

DomotigaPlatform.prototype.getCurrentBatteryLevel = function (thisDevice, callback) {
    var self = this;

    if (thisDevice.polling) {
        // Get value directly from cache if polling is enabled
        self.log('%s: cached battery level is: %s%%', thisDevice.name, thisDevice.cacheCurrentBatteryLevel);
        callback(null, thisDevice.cacheCurrentBatteryLevel);
    } else {
        // Check value if polling is disabled
        this.readCurrentBatteryLevel(thisDevice, function (error, value) {
			if ( error) {
				// on error set level to 0 and LowBattery to low
				thisDevice.cacheCurrentBatteryLevel = 0;
				thisDevice.cacheStatusLowBattery = Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
			} else {
				// Update cache
				thisDevice.cacheCurrentBatteryLevel = value;
			}
            callback(error, thisDevice.cacheCurrentBatteryLevel);
        });
    }
}

DomotigaPlatform.prototype.readLowBatteryStatus = function (thisDevice, callback) {
    var self = this;
    self.log("%s: getting battery status...", thisDevice.name);
	if ( thisDevice.lastBatteryLevel < thisDevice.batteryVoltageLimit) {
		self.log.warn("%s: Battery level normal (%s => Limit: %s)",
			thisDevice.name,Number(thisDevice.lastBatteryLevel).toFixed(3),
			Number(thisDevice.batteryVoltage * thisDevice.batteryVoltageLimit / thisDevice.batteryVoltage).toFixed(3));
		callback(null, Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW);
	} else {
		self.log("%s: Battery level normal (%s => Limit: %s)",
			thisDevice.name,Number(thisDevice.lastBatteryLevel).toFixed(3),
			Number(thisDevice.batteryVoltage * thisDevice.batteryVoltageLimit / thisDevice.batteryVoltage).toFixed(3));
		callback(null, Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
	}
}

DomotigaPlatform.prototype.getLowBatteryStatus = function (thisDevice, callback) {
    var self = this;

    if (thisDevice.polling) {
        // Get value directly from cache if polling is enabled
        self.log('%s: cached battery status is: %s', thisDevice.name, thisDevice.cacheStatusLowBattery);
        callback(null, thisDevice.cacheStatusLowBattery);
    } else {
        // Check value if polling is disabled
        this.readLowBatteryStatus(thisDevice, function (error, value) {
            // Update cache
            thisDevice.cacheStatusLowBattery = value;
            callback(error, thisDevice.cacheStatusLowBattery);
        });
    }
}

// -----------------------------------------------------------------------------
// MOTION CONTROL
// -----------------------------------------------------------------------------

DomotigaPlatform.prototype.readMotionSensorState = function (thisDevice, callback) {
    var self = this;
    self.log("%s: getting motion sensor state...", thisDevice.name);

    this.domotigaGetValue(thisDevice, thisDevice.valueMotionSensor, function (error, result) {
        if (error) {
            self.log.error('%s: readMotionSensorState failed: %s', thisDevice.name, error.message);
            callback(error);
        } else {
            var value = (Number(result) == 0) ? 1 : 0;

            self.log('%s: motion sensor state: %s', thisDevice.name, value);
            callback(null, value);
        }
    });
}

DomotigaPlatform.prototype.getMotionSensorState = function (thisDevice, callback) {
    var self = this;

    if (thisDevice.polling) {
        // Get value directly from cache if polling is enabled
        self.log('%s: cached motion sensor state is: %s', thisDevice.name, thisDevice.cacheMotionSensorState);
        callback(null, thisDevice.cacheMotionSensorState);
    } else {
        // Check value if polling is disabled
        this.readMotionSensorState(thisDevice, function (error, value) {
            // Update cache
            thisDevice.cacheMotionSensorState = value;
            callback(error, thisDevice.cacheMotionSensorState);
        });
    }
}

// -----------------------------------------------------------------------------
// SWITCH CONTROL
// -----------------------------------------------------------------------------

DomotigaPlatform.prototype.readSwitchState = function (thisDevice, callback) {
    var self = this;
    self.log("%s: getting switch state...", thisDevice.name);

    this.domotigaGetValue(thisDevice, thisDevice.valueSwitch, function (error, result) {
        if (error) {
            self.log.error('%s: readSwitchState failed: %s', thisDevice.name, error.message);
            callback(error);
        } else {
			self.log('%s: switch state: %s', thisDevice.name, result);
            callback(null, result);
        }
    });
}

DomotigaPlatform.prototype.getSwitchState = function (thisDevice, callback) {
    var self = this;

    if (thisDevice.polling) {
        // Get value directly from cache if polling is enabled
        self.log('%s: cached switch state is: %s', thisDevice.name, thisDevice.cacheSwitchState);
        callback(null, thisDevice.cacheSwitchState);
    } else {
        // Check value if polling is disabled
        this.readSwitchState(thisDevice, function (error, value) {
            // Update cache
            thisDevice.cacheSwitchState = value;
            callback(error, thisDevice.cacheSwitchState);
        });
    }
}

DomotigaPlatform.prototype.setSwitchState = function (thisDevice, switchOn, callback) {
    var self = this;
    self.log("%s: setting switch state to %s", thisDevice.name, switchOn);
    var switchCommand;

    if (switchOn == 1) {
        switchCommand = "On";
    }
    else {
        switchCommand = "Off";
    }

    // Update cache
    thisDevice.cacheSwitchState = switchOn;

    var callbackWasCalled = false;
    this.domotigaSetValue(thisDevice, thisDevice.valueSwitch, switchCommand, function (err) {
        if (callbackWasCalled) {
            self.log.warn("WARNING: domotigaSetValue called its callback more than once! Discarding the second one.");
        }
        callbackWasCalled = true;
        if (!err) {
            self.log("%s: successfully set switch state to %s", thisDevice.name, switchCommand);
            callback(null);
        } else {
            self.log.error("%s: error setting switch state to %s", thisDevice.name, switchCommand);
            callback(err);
        }
    });
}

// -----------------------------------------------------------------------------
// DOOR CONTROL
// -----------------------------------------------------------------------------

DomotigaPlatform.prototype.getDoorPositionState = function (thisDevice, callback) {
    // At this time the value property of PositionState is always mapped to stopped
    callback(null, Characteristic.PositionState.STOPPED);
}

DomotigaPlatform.prototype.readDoorPosition = function (thisDevice, callback) {
    var self = this;
    self.log("%s: getting door position...", thisDevice.name);

    this.domotigaGetValue(thisDevice, thisDevice.valueDoor, function (error, result) {
        if (error) {
            self.log.error('%s: readDoorPosition failed: %s', thisDevice.name, error.message);
            callback(error);
        } else {

            var value = (result.toLowerCase() == "0") ? 0 : 100;
            self.log('%s: door position: %s', thisDevice.name, value);
            callback(null, value);
        }
    });
}

DomotigaPlatform.prototype.getDoorPosition = function (thisDevice, callback) {
    var self = this;

    if (thisDevice.polling) {
        // Get value directly from cache if polling is enabled
        self.log('%s: cached door position is: %s', thisDevice.name, thisDevice.cacheDoorPosition);
        callback(null, thisDevice.cacheDoorPosition);
    } else {
        // Check value if polling is disabled
        this.readDoorPosition(thisDevice, function (error, value) {
            // Update cache
            thisDevice.cacheDoorPosition = value;
            callback(error, thisDevice.cacheDoorPosition);
        });
    }
}

DomotigaPlatform.prototype.setDoorPosition = function (thisDevice, targetPosition, callback) {
    var self = this;
    self.log("%s: setting door position to %s", thisDevice.name, targetPosition);

    // At this time we do not use percentage values: 1 = open, 0 = closed
    var doorPosition;

    if (targetPosition == 0) {
        doorPosition = "0";
    }
    else {
        doorPosition = "1";
    }

    // Update cache
    thisDevice.cacheDoorPosition = doorPosition;

    // Update position state
    var accessory = this.accessories[thisDevice.name];
    if (accessory)
        accessory.getService(Service.Door).setCharacteristic(Characteristic.PositionState, Characteristic.PositionState.STOPPED);

    var callbackWasCalled = false;
    this.domotigaSetValue(thisDevice, thisDevice.valueDoor, doorPosition, function (err) {
        if (callbackWasCalled) {
            self.log.warn("WARNING: domotigaSetValue called its callback more than once! Discarding the second one.");
        }
        callbackWasCalled = true;
        if (!err) {
            self.log("%s: successfully set door position to %s", thisDevice.name, targetPosition);
            callback(null);
        } else {
            self.log.error("%s: error setting door position to %s", thisDevice.name, targetPosition);
            callback(err);
        }
    });
}

// -----------------------------------------------------------------------------
// WINDOW CONTROL
// -----------------------------------------------------------------------------

DomotigaPlatform.prototype.getWindowPositionState = function (thisDevice, callback) {
    // At this time the value property of PositionState is always mapped to stopped
    callback(null, Characteristic.PositionState.STOPPED);
}

DomotigaPlatform.prototype.readWindowPosition = function (thisDevice, callback) {
    var self = this;
    self.log("%s: getting window position...", thisDevice.name);

    this.domotigaGetValue(thisDevice, thisDevice.valueWindow, function (error, result) {
        if (error) {
            self.log.error('%s: readWindowPosition failed: %s', thisDevice.name, error.message);
            callback(error);
        } else {

            var value = (result.toLowerCase() == "0") ? 0 : 100;
            self.log('%s: window position: %s', thisDevice.name, value);
            callback(null, value);
        }
    });
}

DomotigaPlatform.prototype.getWindowPosition = function (thisDevice, callback) {
    var self = this;

    if (thisDevice.polling) {
        // Get value directly from cache if polling is enabled
        self.log('%s: Cached window position is: %s', thisDevice.name, thisDevice.cacheWindowPosition);
        callback(null, thisDevice.cacheWindowPosition);
    } else {
        // Check value if polling is disabled
        this.readWindowPosition(thisDevice, function (error, value) {
            // Update cache
            thisDevice.cacheWindowPosition = value;
            callback(error, thisDevice.cacheWindowPosition);
        });
    }
}

DomotigaPlatform.prototype.setWindowPosition = function (thisDevice, targetPosition, callback) {
    var self = this;
    self.log("%s: setting window position to %s", thisDevice.name, targetPosition);

    // At this time we do not use percentage values: 1 = open, 0 = closed
    var windowPosition;

    if (targetPosition == 0) {
        windowPosition = "0";
    }
    else {
        windowPosition = "1";
    }

    // Update cache
    thisDevice.cacheWindowPosition = windowPosition;

    // Update position state
    var accessory = this.accessories[thisDevice.name];
    if (accessory)
        accessory.getService(Service.Window).setCharacteristic(Characteristic.PositionState, Characteristic.PositionState.STOPPED);

    var callbackWasCalled = false;
    this.domotigaSetValue(thisDevice, thisDevice.valueWindow, windowPosition, function (err) {
        if (callbackWasCalled) {
            self.log.warn("WARNING: domotigaSetValue called its callback more than once! Discarding the second one.");
        }
        callbackWasCalled = true;
        if (!err) {
            self.log("%s: successfully set window position to %s", thisDevice.name, targetPosition);
            callback(null);
        } else {
            self.log.error("%s: error setting window position to %s", thisDevice.name, targetPosition);
            callback(err);
        }
    });
}

// -----------------------------------------------------------------------------
// WINDOW COVER CONTROL
// -----------------------------------------------------------------------------

DomotigaPlatform.prototype.getWindowCoveringPositionState = function (thisDevice, callback) {
    // At this time the value property of PositionState is always mapped to stopped
    callback(null, Characteristic.PositionState.STOPPED);
}

DomotigaPlatform.prototype.readWindowCoveringPosition = function (thisDevice, callback) {
    var self = this;
    self.log("%s: getting window covering position...", thisDevice.name);

    this.domotigaGetValue(thisDevice, thisDevice.valueWindowCovering, function (error, result) {
        if (error) {
            self.log.error('%s: readWindowCoveringPosition failed: %s', thisDevice.name, error.message);
            callback(error);
        } else {

            var value = (result.toLowerCase() == "0") ? 0 : 100;
            self.log('%s: window covering position: %s', thisDevice.name, value);
            callback(null, value);
        }
    });
}

DomotigaPlatform.prototype.getWindowCoveringPosition = function (thisDevice, callback) {
    var self = this;

    if (thisDevice.polling) {
        // Get value directly from cache if polling is enabled
        self.log('%s: cached window covering position is: %s', thisDevice.name, thisDevice.cacheWindowCoveringPosition);
        callback(null, thisDevice.cacheWindowCoveringPosition);
    } else {
        // Check value if polling is disabled
        this.readWindowCoveringPosition(thisDevice, function (error, value) {
            // Update cache
            thisDevice.cacheWindowCoveringPosition = value;
            callback(error, thisDevice.cacheWindowCoveringPosition);
        });
    }
}

DomotigaPlatform.prototype.setWindowCoveringPosition = function (thisDevice, targetPosition, callback) {
    var self = this;
    self.log("%s: setting window covering position to %s", thisDevice.name, targetPosition);

    // At this time we do not use percentage values: 1 = open, 0 = closed
    var windowcoveringPosition;

    if (targetPosition == 0) {
        windowcoveringPosition = "0";
    }
    else {
        windowcoveringPosition = "1";
    }

    // Update cache
    thisDevice.cacheWindowCoveringPosition = windowcoveringPosition;

    // Update position state
    var accessory = this.accessories[thisDevice.name];
    if (accessory)
        accessory.getService(Service.WindowCovering).setCharacteristic(Characteristic.PositionState, Characteristic.PositionState.STOPPED);

    var callbackWasCalled = false;
    this.domotigaSetValue(thisDevice, thisDevice.valueWindowCovering, windowcoveringPosition, function (err) {
        if (callbackWasCalled) {
            self.log.warn("WARNING: domotigaSetValue called its callback more than once! Discarding the second one.");
        }
        callbackWasCalled = true;
        if (!err) {
            self.log("%s: successfully set window covering position to %s", thisDevice.name, targetPosition);
            callback(null);
        } else {
            self.log.error("%s: error setting window covering position to %s", thisDevice.name, targetPosition);
            callback(err);
        }
    });
}

// -----------------------------------------------------------------------------
// LIGHTBULB
// read -> read data from device and return
// get 	-> return current (from read) or cached value
// -----------------------------------------------------------------------------

DomotigaPlatform.prototype.setLightState = function (thisDevice, value, callback) {
    var self = this;
	self.log("%s: setting light.state to %s", thisDevice.name, value);

	var valueNo = thisDevice.valueLight; // default
	if ( thisDevice.color || thisDevice.brightness) { //
		valueNo = "state";
	}
	self.domotigaSetValue(thisDevice, valueNo, value, function (error,value) {
		if ( error) {
			self.log.warn("%s: Error while setting light.state to %s", thisDevice.name, value);
			callback();
		} else {
			callback(null,value);
		}
	});

}

DomotigaPlatform.prototype.readLightState = function (thisDevice, callback) {
    var self = this;
	self.log("%s: getting light.state %s", thisDevice.name,thisDevice.valueLight);

	var valueNo = thisDevice.valueLight;
	if ( thisDevice.color || thisDevice.brightness) {
		valueNo = "state";
		var propValue = {type: "state", valueNo: thisDevice.valueLight};
	}
	self.domotigaGetValue(thisDevice, valueNo, function (error,value){
		if ( error) {
			self.log.warn("%s: Error while getting light.state", thisDevice.name);
		} else {
			self.log("%s: light.state %s => %s", thisDevice.name,thisDevice.valueLight, value);
		}
		callback(error,value);
	});
}

DomotigaPlatform.prototype.getLightState = function (thisDevice, callback) {
	var self = this;
 	if(thisDevice.polling) {
		self.log('%s: cached light.state is: %s', thisDevice.name, thisDevice.cacheLightState);
		callback(null, thisDevice.cacheLightState);
	} else {
		this.readLightState(thisDevice, function (error, value) {
			thisDevice.cacheLightState = value;
			callback(error, thisDevice.cacheLightState);
		});
	}
}


DomotigaPlatform.prototype.setLightBrightness = function (thisDevice, value, callback) {
    var self = this;
	self.log("%s: setting light brightness to %s", thisDevice.name, value);
	self.domotigaSetValue(thisDevice, "brightness", value / 100, function (error,value){
		if ( error) {
			self.log.warn("%s: Error while setting light.brightness to %s", thisDevice.name, value);
			callback();
		} else {
			callback(null,value);
		}
	});

}

DomotigaPlatform.prototype.readLightBrightness = function (thisDevice, callback) {
    var self = this;
	self.log("%s: getting light.brightness", thisDevice.name);
	self.domotigaGetValue(thisDevice, "brightness", function (error,value){
		if ( error) {
			self.log.warn("%s: Error while getting light.brightness", thisDevice.name);
			callback();
		} else {
			self.log("%s: light.brightness => %s", thisDevice.name, value * 100);
			callback(null,value * 100);
		}
	});
}

DomotigaPlatform.prototype.getLightBrightness = function (thisDevice, callback) {
	var self = this;
	if(thisDevice.polling) {
		self.log('%s: cached light.brightness is: %s', thisDevice.name, thisDevice.cacheLightBrightness);
		callback(null, thisDevice.cacheLightBrightness);
	} else {
		this.readLightBrightness(thisDevice, function (error, value) {
			thisDevice.cacheLightBrightness = value;
			callback(error, thisDevice.cacheLightBrightness);
		});
	}
}


DomotigaPlatform.prototype.setLightHue = function (thisDevice, value, callback) {
    var self = this;

	self.log("%s: setting light.hue to %s", thisDevice.name, value);
	self.domotigaSetValue(thisDevice, "hue", value, function (error,value){
		if ( error) {
			self.log.warn("%s: Error while setting light.hue to %s", thisDevice.name, value);
			callback();
		} else {
			callback(null,value);
		}
	});

}

DomotigaPlatform.prototype.readLightHue = function (thisDevice, callback) {
    var self = this;
	self.log("%s: getting light.hue", thisDevice.name);
	self.domotigaGetValue(thisDevice,"hue",function (error,value){
		if ( error) {
			self.log.warn("%s: Error while getting light.hue", thisDevice.name);
			callback();
		} else {
			self.log("%s: light.hue => %s", thisDevice.name, value);
			callback(null,value);
		}
	});
}

DomotigaPlatform.prototype.getLightHue = function (thisDevice, callback) {
	var self = this;
	if(thisDevice.polling) {
		self.log('%s: cached light.hue is: %s', thisDevice.name, thisDevice.cacheLightHue);
		callback(null, thisDevice.cacheLightHue);
	} else {
		this.readLightHue(thisDevice, function (error, value) {
			thisDevice.cacheLightHue = value;
			callback(error, thisDevice.cacheLightHue);
		});
	}
}


DomotigaPlatform.prototype.setLightSaturation = function (thisDevice, value, callback) {
    var self = this;

	self.log("%s: setting light.saturation to %s", thisDevice.name, value);
	self.domotigaSetValue(thisDevice,"saturation", value / 100, function (error,value){
		if ( error) {
			self.log.warn("%s: Error while setting light.saturation to %s", thisDevice.name, value / 100);
			callback();
		} else {
			callback(null,value);
		}
	});

}

DomotigaPlatform.prototype.readLightSaturation = function (thisDevice, callback) {
    var self = this;
	self.log("%s: getting light.saturation", thisDevice.name);
	self.domotigaGetValue(thisDevice,"saturation",function (error,value){
		if ( error) {
			self.log.warn("%s: Error while getting light.saturation", thisDevice.name);
			callback();
		} else {
			self.log("%s: light.saturation => %s", thisDevice.name, value*100);
			callback(null,value * 100);
		}
	}.bind(this));
}

DomotigaPlatform.prototype.getLightSaturation = function (thisDevice, callback) {
	var self = this;
	if(thisDevice.polling) {
		self.log('%s: cached light.saturation is: %s', thisDevice.name, thisDevice.cacheLightSaturation);
		callback(null, thisDevice.cacheLightSaturation);
	} else {
		this.readLightSaturation(thisDevice, function (error, value) {
			thisDevice.cacheLightSaturation = value;
			callback(error, thisDevice.cacheLightSaturation);
		});
	}
}

// -----------------------------------------------------------------------------
// BACKEND GETTER/SETTER
// -----------------------------------------------------------------------------

// callback for all backend getter to provide unique parsing structure and central controlling
DomotigaPlatform.prototype.parseResponseData = function(thisDevice, source, deviceValueNo, data, callback) {
	var self = this;
	var resultValue;
	var resultError;
	var resultDate;
	var format;

	try {
		data = JSON.parse(data);
	} catch (e) {
	}

	switch(typeof data) {
		case "string":
		case "number":
			if ( Number(data) == NaN ) {
				resultError = new Error("Invalid response (non-numeric value returned)");
				break;
			}
			resultValue = Number(data);
			if ( thisDevice.file ) {
				var stats = fs.statSync(source);
				// get file last modified date
				resultDate = new Date(stats.mtime);
			}
			break;

		case "object": // json
			// if ( thisDevice.name == "Farblicht") {
			self.log.warn(" ===> ", JSON.stringify(data));
			// }
			if ( ! data.jsonrpc ) {
				//self.log.warn("%s: Missing jsonrpc-element.",thisDevice.name); // just a warning
			}
			if ( ! data.result ) {
				if ( data.error ) {
					resultError= new Error(thisDevice.name + ": Invalid response ("+ data.error.message + ")");
				} else {
					resultError= new Error(thisDevice.name + ": Invalid response (Missing result)");
				}
				break;
			}

			if ( ! data.result.values ) {
				resultError = new Error(thisDevice.name + ": Invalid response (Missing result.values)");
				break;
			}

			// result.date as part of result
			if ( data.result.date ) {
				resultDate = new Date(data.result.date);
			}

			// seems to be a valid response so far

			// 1) check for numerical index: result.values[4].value (the domotiga way)
			if ( Array.isArray(data.result.values) && Number(deviceValueNo) != NaN ) {
				//
				self.log("%s: isArray", thisDevice.name, deviceValueNo);
				if (  data.result.values.length <= Number(deviceValueNo) ) {
					let index = Number(deviceValueNo) - 1;
					resultValue = data.result.values[index].value;
					// do we have a date as well?
					if ( data.result.values[index].hasOwnProperty("date") ) {
						resultDate = new Date(data.result.values[index].date);
					}
					// ok
					break;
				}
				// array index out of bound (no matching index -> try deviceValueNo as property
			}

			// 2) check for named object: result.values["valueXYZ"].value
			if ( data.result.values.hasOwnProperty(deviceValueNo) ) {
				if ( data.result.values[deviceValueNo].hasOwnProperty("value") ) {
					resultValue = Number(data.result.values[deviceValueNo].value);
					// do we have a date as well?
					if ( data.result.values[deviceValueNo].date ) {
						resultDate = new Date(data.result.values[deviceValueNo].date);
					}
					break; // ok
				}
				//
				// fallback (just give it a try)
				if ( Number(data.result.values[deviceValueNo]) != NaN) {
				 	resultValue = Number(data.result.values[deviceValueNo]);
				 	break; // match
				}
			}
			//
			resultError = new Error("Invalid response (Can't detect data structure)");
			break;

		default:
			self.log.error("%s: Unknown backend format", thisDevice.name);
			break;
	}

	// ----------------------------------------------------------------
	// validate age if required
	// ----------------------------------------------------------------
	if ( ! resultError && thisDevice.maxAgeInSeconds ) {
		if ( ! resultDate ) {
			self.log.warn("%s: Skipping maxAge-validation! No creation date found in response. Please check data source for necessary attributes",thisDevice.name);
		} else {
			var nowDate = new Date();
			var ageInSeconds = parseInt((nowDate-resultDate) / 1000);
			if ( ageInSeconds > thisDevice.maxAgeInSeconds ) {
				self.log.warn("%s: Value date out of exaptable time range: %s sec (%s sec allowed)",thisDevice.name,ageInSeconds,thisDevice.maxAgeInSeconds);
				resultError = new Error(thisDevice.name + ": Sensor data too old")
			} else{
				//self.log.warn("%s: Value date within time range: %s sec (%s sec allowed)",thisDevice.name,ageInSeconds,thisDevice.maxAgeInSeconds);
			}
		}
	}
	callback(resultError,resultValue);
}

// BACKEND: tcp endpoint

DomotigaPlatform.prototype.getValueEndpoint = function (thisDevice, deviceValueNo, callback) {
	var self = this;
	var request = {
		jsonrpc: "2.0",
		method: "device.get",
		id: 1,
		params: {
			"device_id": thisDevice.device,
			"valuenum": deviceValueNo
		}
	};

	JSONRequest(thisDevice.endpoint, request, function (err, data) {
		if ( err ) {
			callback(err);
		} else {
			self.parseResponseData(thisDevice, thisDevice.endpoint, deviceValueNo, data, callback);
		}
	});
}

DomotigaPlatform.prototype.setValueEndpoint = function (thisDevice, deviceValueNo, value, callback) {
	var self = this;
	var request ={
		jsonrpc: "2.0",
		method: "device.set",
		id: 1,
		params: {
			"device_id": thisDevice.device,
			"valuenum": deviceValueNo,
			"value": value
		}
	};

	JSONRequest(thisDevice.endpoint, request, function (err, data) {
		if ( self.debug) {
			self.log(" >> %s",JSON.stringify(request));
			self.log(" << %s",JSON.stringify(data));
		}
		if (err) {
			self.log.error("Sorry err: ", err);
		}
		callback(err);
	});
}

// ------------------------------------------------------------------------------------------------
// BACKEND: command execution

DomotigaPlatform.prototype.executeCommand = function (command, callback) {
	var self = this;

	// make sure, all placeholders are removed
	command  = command.replace(/\$\w+/g,"");

	if ( self.debug) {
		self.log("=> %s",command);
	}
	exec(command, function (error, stdout, stderr) {
		if ( error ) {
			self.log.error("	==> %s ", error);
			if ( stderr ) {
				self.log.warn("	==> ", stderr);
			}
			callback(error);
		} else {
			stdout = stdout.replace(/\n/g,"");		// replace all newline
			//self.log("==> ", stdout);
			callback(null, stdout);
		}
	});
}

DomotigaPlatform.prototype.getValueCommand = function (thisDevice, deviceValueNo, callback) {
	var self = this;
	var cmd = thisDevice.command;

	// replace known placeholders
	cmd = cmd.replace(/\$device/,thisDevice.device);
	cmd = cmd.replace(/\$value/,deviceValueNo);

	self.executeCommand(cmd,function (error, result) {
		if ( error) {
			callback(error);
		} else {
			self.parseResponseData(thisDevice,cmd, deviceValueNo, result, callback);
		}
	});
}

DomotigaPlatform.prototype.setValueCommand = function (thisDevice, deviceValueNo, value, callback) {
	var self = this;
	var cmd = thisDevice.command;
	//	cmd = cmd + ' ' + thisDevice.flags;

	// replace placeholder
	cmd = cmd.replace(/\$device/,thisDevice.device);
	cmd = cmd.replace(/\$value/,deviceValueNo);
	cmd = cmd.replace(/\$state/,value);
	cmd = cmd.replace(/\$rgb/,""); // later -> send additional rgb value for all hsl changes (works only with value caching)

	self.executeCommand(cmd, function (error,result) {
		callback(error);
	});
}

// ------------------------------------------------------------------------------------------------
// BACKEND: file TODO: not implemented

DomotigaPlatform.prototype.getValueFile = function (thisDevice, deviceValueNo, callback) {}

DomotigaPlatform.prototype.setValueFile = function (thisDevice, deviceValueNo, value, callback) {}

// ------------------------------------------------------------------------------------------------
// ------------------------------------------------------------------------------------------------

// Set value at domotiga database
DomotigaPlatform.prototype.domotigaSetValue = function (thisDevice, deviceValueNo, value, callback) {
	var self = this;

	// convert value to numeric
	// TODO is that ok for domotiga backend?

	switch(typeof value){
		case "string":
			value = (value.toLowerCase() == "off") ? 0 : 1;
			break;
		case "boolean":
			value = (value === false) ? 0 : 1;
			break;
		case "number":
			// nothing to do - can be used as is
			break;
		default:
			self.log.warn("%s: Don't know how to convert value of type '%s' (trying to use it as is)",thisDevice.name, typeof value);
	}

	// common callback for backend functions
	var resultHandler = function(error) {
		if ( error ) {
			self.log.warn("%s: error getting value (%s)", thisDevice.name, error);
			callback(error);
		} else {
			callback();
		}
	};

	switch (thisDevice.backend) {
		case "endpoint":
			self.setValueEndpoint(thisDevice, deviceValueNo, value, resultHandler);
			break;

		case "command":
			self.setValueCommand(thisDevice, deviceValueNo, value, resultHandler);
			break;

		case "file":
			self.setValueFile(thisDevice, deviceValueNo, value, resultHandler);
			break;

		default:
			self.log.warn("%s: setValue: Unsupported backend: %s ", thisDevice.name, thisDevice.backend);
			callback();
	}
}

// Get value from domotiga database
DomotigaPlatform.prototype.domotigaGetValue = function (thisDevice, deviceValueNo, callback) {
    var self = this;

	// parse return value
	var resultHandler = function (error, data) {
		if ( error ) {
			self.log.warn("%s: error getting value (%s)", thisDevice.name, error);
			callback(error);
		} else {
			// --> plain result: validate return value
			if ( Number.isNaN(data) === true ) {
				// try to convert
				if ( typeof data == "string" && (data.toLowerCase() == "on" || data.toLowerCase() == "true")) {
					callback(null,1);
				} else if( typeof data == "string" && (data.toLowerCase() == "off" || data.toLowerCase() == "false")) {
					callback(null,1);
				} else {
					self.log.warn("Result discarded (%s => %s)",data, typeof data);
					callback();
				}
			} else {
				callback(null,Number(data));
			}
		}
	};

	switch ( thisDevice.backend ) {
		case "endpoint":
			self.getValueEndpoint(thisDevice, deviceValueNo, resultHandler);
			break;

		case "command":
			self.getValueCommand(thisDevice, deviceValueNo, resultHandler);
			break;

		case "file":
			self.getValueFile(thisDevice, deviceValueNo, resultHandler);
			break;

		default:
			self.log.warn("%s: getValue: Unsupported backend: %s",thisDevice.name, thisDevice.backend);
			callback();
	}
}

// ------------------------------------------------------------------------------------------------
// ------------------------------------------------------------------------------------------------

// Method to handle identify request
DomotigaPlatform.prototype.identify = function (thisDevice, paired, callback) {
	var self = this;
	self.log("%s: identify requested", thisDevice.name);

	if ( thisDevice.identityCall ) {
		if ( self.backend == "endpoint" ) {
			var request = {
				jsonrpc: "2.0",
				method: "device.identity",
				id: 1,
				params: {
					"device_id": thisDevice.device,
				}
			};
			JSONRequest(thisDevice.identityCall, request, function (err, data) {});

		} else if ( this.backend == "command" ) {
			self.executeCommand(thisDevice.identityCall, function(err,data){})
		} else {
			this.log("%s: identify requested not supported", thisDevice.name);
		}
	}
    callback();
}

DomotigaPlatform.prototype.getVersion = function () {
    var pjPath = path.join(__dirname, './package.json');
    var pj = JSON.parse(fs.readFileSync(pjPath));
    return pj.version;
}

DomotigaPlatform.prototype.fetch_npmVersion = function (pck, callback) {
    var exec = require('child_process').exec;
    var cmd = 'npm view ' + pck + ' version';
    exec(cmd, function (error, stdout, stderr) {
        var npm_version = stdout;
        npm_version = npm_version.replace('\n', '');
        callback(npm_version);
    });
}

// Method to handle plugin configuration in HomeKit app
DomotigaPlatform.prototype.configurationRequestHandler = function (context, request, callback) {
    if (request && request.type === "Terminate") {
        return;
    }

    // Instruction
    if (!context.step) {
        var instructionResp = {
            "type": "Interface",
            "interface": "instruction",
            "title": "Before You Start...",
            "detail": "Please make sure homebridge is running with elevated privileges.",
            "showNextButton": true
        }

        context.step = 1;
        callback(instructionResp);
    } else {
        switch (context.step) {
            case 1:
                // Operation choices
                var respDict = {
                    "type": "Interface",
                    "interface": "list",
                    "title": "What do you want to do?",
                    "items": [
                      "Add New Device",
                      "Modify Existing Device",
                      "Remove Existing Device"
                    ]
                }

                context.step = 2;
                callback(respDict);
                break;
            case 2:
                var selection = request.response.selections[0];
                if (selection === 0) {
                    // Info for new accessory
                    var respDict = {
                        "type": "Interface",
                        "interface": "input",
                        "title": "New Device",
                        "items": [{
                            "id": "name",
                            "title": "Name (Required)",
                            "placeholder": "HTPC"
                        }]
                    };

                    context.operation = 0;
                    context.step = 3;
                    callback(respDict);
                } else {
                    var self = this;
                    var names = Object.keys(this.accessories).map(function (k) { return self.accessories[k].context.name });

                    if (names.length > 0) {
                        // Select existing accessory for modification or removal
                        if (selection === 1) {
                            var title = "Which device do you want to modify?";
                            context.operation = 1;
                        } else {
                            var title = "Which device do you want to remove?";
                            context.operation = 2;
                        }
                        var respDict = {
                            "type": "Interface",
                            "interface": "list",
                            "title": title,
                            "items": names
                        };

                        context.list = names;
                        context.step = 3;
                    } else {
                        var respDict = {
                            "type": "Interface",
                            "interface": "instruction",
                            "title": "Unavailable",
                            "detail": "No device is configured.",
                            "showNextButton": true
                        };

                        context.step = 1;
                    }
                    callback(respDict);
                }
                break;
            case 3:
                if (context.operation === 2) {
                    // Remove selected accessory from HomeKit
                    var selection = context.list[request.response.selections[0]];
                    var accessory = this.accessories[selection];

                    this.removeAccessory(accessory);
                    var respDict = {
                        "type": "Interface",
                        "interface": "instruction",
                        "title": "Success",
                        "detail": "The device is now removed.",
                        "showNextButton": true
                    };

                    context.step = 5;
                }
                else {
                    if (context.operation === 0) {
                        var data = request.response.inputs;
                    } else if (context.operation === 1) {
                        var selection = context.list[request.response.selections[0]];
                        var data = this.accessories[selection].context;
                    }

                        //    if (data.name) {
                        //        // Add/Modify info of selected accessory
                        //        var respDict = {
                        //            "type": "Interface",
                        //            "interface": "input",
                        //            "title": data.name,
                        //            "items": [{
                        //                "id": "on_cmd",
                        //                "title": "CMD to Turn On",
                        //                "placeholder": context.operation ? "Leave blank if unchanged" : "wakeonlan XX:XX:XX:XX:XX:XX"
                        //            }, {
                        //                "id": "off_cmd",
                        //                "title": "CMD to Turn Off",
                        //                "placeholder": context.operation ? "Leave blank if unchanged" : "net rpc shutdown -I XXX.XXX.XXX.XXX -U user%password"
                        //            }, {
                        //                "id": "state_cmd",
                        //                "title": "CMD to Check ON State",
                        //                "placeholder": context.operation ? "Leave blank if unchanged" : "ping -c 2 -W 1 XXX.XXX.XXX.XXX | grep -i '2 received'"
                        //            }, {
                        //                "id": "polling",
                        //                "title": "Enable Polling (true/false)",
                        //                "placeholder": context.operation ? "Leave blank if unchanged" : "false"
                        //            }, {
                        //                "id": "interval",
                        //                "title": "Polling Interval",
                        //                "placeholder": context.operation ? "Leave blank if unchanged" : "1"
                        //            }, {
                        //                "id": "manufacturer",
                        //                "title": "Manufacturer",
                        //                "placeholder": context.operation ? "Leave blank if unchanged" : "Default-Manufacturer"
                        //            }, {
                        //                "id": "model",
                        //                "title": "Model",
                        //                "placeholder": context.operation ? "Leave blank if unchanged" : "Default-Model"
                        //            }, {
                        //                "id": "serial",
                        //                "title": "Serial",
                        //                "placeholder": context.operation ? "Leave blank if unchanged" : "Default-SerialNumber"
                        //            }]
                        //        };

                        //        delete context.list;
                        //        delete context.operation;
                        //        context.name = data.name;
                        //        context.step = 4;
                        //    }
                    else {
                        // Error if required info is missing
                        var respDict = {
                            "type": "Interface",
                            "interface": "instruction",
                            "title": "Error",
                            "detail": "Name of the device is missing.",
                            "showNextButton": true
                        };

                        context.step = 1;
                    }
                }
                callback(respDict);
                break;
                //case 4:
                //    var userInputs = request.response.inputs;
                //    var newSwitch = {};

                //    // Setup input for addAccessory
                //    if (this.accessories[context.name]) {
                //        newSwitch = JSON.parse(JSON.stringify(this.accessories[context.name].context));
                //    }

                //    newAccessory.name = context.name;
                //    newAccessory.on_cmd = userInputs.on_cmd || newSwitch.on_cmd;
                //    newAccessory.off_cmd = userInputs.off_cmd || newSwitch.off_cmd;
                //    newAccessory.state_cmd = userInputs.state_cmd || newSwitch.state_cmd;
                //    newAccessory.polling = userInputs.polling || newSwitch.polling;
                //    newAccessory.interval = userInputs.interval || newSwitch.interval;
                //    newAccessory.manufacturer = userInputs.manufacturer;
                //    newAccessory.model = userInputs.model;
                //    newAccessory.serial = userInputs.serial;

                //    // Register or update accessory in HomeKit
                //    this.addAccessory(newAccessory);
                //    var respDict = {
                //        "type": "Interface",
                //        "interface": "instruction",
                //        "title": "Success",
                //        "detail": "The new device is now updated.",
                //        "showNextButton": true
                //    };

                //    context.step = 5;
                //    callback(respDict);
                //    break;
                //case 5:
                //    // Update config.json accordingly
                //    var self = this;
                //    delete context.step;
                //    var newConfig = this.config;
                //    var newSwitches = Object.keys(this.accessories).map(function (k) {
                //        var accessory = self.accessories[k];
                //        var data = {
                //            'name': accessory.context.name,
                //            'on_cmd': accessory.context.on_cmd,
                //            'off_cmd': accessory.context.off_cmd,
                //            'state_cmd': accessory.context.state_cmd,
                //            'polling': accessory.context.polling,
                //            'interval': accessory.context.interval,
                //            'manufacturer': accessory.context.manufacturer,
                //            'model': accessory.context.model,
                //            'serial': accessory.context.serial
                //        };
                //        return data;
                //    });

                //    newConfig.switches = newSwitches;
                //    callback(null, "platform", true, newConfig);
                //    break;
        }
    }
}
