'use strict';

/* Magic Mirror
 * Module: MMM-PIR-Sensor
 *
 * By Paul-Vincent Roll http://paulvincentroll.com
 * MIT Licensed.
 */

const NodeHelper = require('node_helper');
const Gpio = require('onoff').Gpio;
const exec = require('child_process').exec;

module.exports = NodeHelper.create({
  start: function () {
    this.started = false;
  },

  activateMonitor: function () {
    if (this.config.relayPIN != false) {
      this.relay.writeSync(this.config.relayOnState);
    }
    else if (this.config.relayPIN == false){
      if (this.config.useVcgencmd) {
        exec("vcgencmd display_power 1");
      }
      else {
        // Check if hdmi output is already on
        exec("/opt/vc/bin/tvservice -s").stdout.on('data', function(data) {
          if (data.indexOf("0x120002") !== -1)
            exec("/opt/vc/bin/tvservice --preferred && chvt 6 && chvt 7", null);
        });
      }
    }
  },

  deactivateMonitor: function () {
    if (this.config.relayPIN != false) {
      this.relay.writeSync(this.config.relayOffState);
    }
    else if (this.config.relayPIN == false){
      if (this.config.useVcgencmd) {
        exec("vcgencmd display_power 0");
      }
      else {
        exec("/opt/vc/bin/tvservice -o", null);
      }
    }
  },

  // Subclass socketNotificationReceived received.
  socketNotificationReceived: function(notification, payload) {
    if (notification === 'CONFIG' && this.started == false) {
      const self = this;
      this.config = payload;

      //Setup pins
      this.pir = new Gpio(this.config.sensorPIN, 'in', 'both');
      // exec("echo '" + this.config.sensorPIN.toString() + "' > /sys/class/gpio/export", null);
      // exec("echo 'in' > /sys/class/gpio/gpio" + this.config.sensorPIN.toString() + "/direction", null);

      if (this.config.relayPIN) {
        this.relay = new Gpio(this.config.relayPIN, 'out');
        this.relay.writeSync(this.config.relayOnState);
        if (this.config.useVcgencmd) {
          exec("vcgencmd display_power 1");
        }
        else {
          exec("/opt/vc/bin/tvservice --preferred && chvt 6 && chvt 7", null);
        }
      }

      //Detected movement
      this.pir.watch(function(err, value) {
        if (value == 1) {
          self.sendSocketNotification("USER_PRESENCE", true);
          if (self.config.powerSaving){
            clearTimeout(self.deactivateMonitorTimeout);
            self.activateMonitor();
          }
        }
        else if (value == 0) {
          self.sendSocketNotification("USER_PRESENCE", false);
          if (!self.config.powerSaving){
            return;
          }

          self.deactivateMonitorTimeout = setTimeout(function() {
            self.deactivateMonitor();
          }, self.config.powerSavingDelay * 1000);
        }
      });

      this.started = true;

    } else if (notification === 'SCREEN_WAKEUP') {
      this.activateMonitor();
    }
  }

});
