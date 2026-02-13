/**
 * CSInterface - Adobe CEP Communication Interface
 * Based on Adobe CEP SDK (Public Domain)
 */

var CSInterface = (function () {
  'use strict';

  var VERSION = 12;
  var HostId = {
    KBRG: "KBRG",
    PPRO: "PPRO",
    PHXS: "PHXS",
    AEFT: "AEFT"
  };

  var CSEvent = function (type, scope, appId, extensionId) {
    this.type = type || '';
    this.scope = scope || 'APPLICATION';
    this.appId = appId || '';
    this.extensionId = extensionId || '';
    this.data = '';
  };

  function CSInterface() {
    this.hostEnvironment = null;
  }

  CSInterface.prototype.getSystemPath = function (pathType) {
    var path = '';
    if (window.__adobe_cep__) {
      try {
        path = window.__adobe_cep__.getSystemPath(pathType);
      } catch (e) {
        console.error('[CSInterface] getSystemPath error:', e);
      }
    }
    return path;
  };

  CSInterface.prototype.getExtensionId = function () {
    if (window.__adobe_cep__) {
      return window.__adobe_cep__.getExtensionId();
    }
    return '';
  };

  CSInterface.prototype.evalScript = function (script, callback) {
    if (window.__adobe_cep__) {
      try {
        window.__adobe_cep__.evalScript(script, callback);
      } catch (e) {
        console.error('[CSInterface] evalScript error:', e);
        if (callback) callback('EvalScript error.');
      }
    } else {
      console.error('[CSInterface] __adobe_cep__ not found');
      if (callback) callback('EvalScript error.');
    }
  };

  CSInterface.prototype.getHostEnvironment = function () {
    if (!this.hostEnvironment) {
      if (window.__adobe_cep__) {
        try {
          this.hostEnvironment = JSON.parse(window.__adobe_cep__.getHostEnvironment());
        } catch (e) {
          console.error('[CSInterface] getHostEnvironment error:', e);
        }
      }
    }
    return this.hostEnvironment;
  };

  CSInterface.prototype.getApplicationID = function () {
    var env = this.getHostEnvironment();
    return env ? env.appId : '';
  };

  CSInterface.prototype.addEventListener = function (type, listener, obj) {
    if (window.__adobe_cep__) {
      try {
        window.__adobe_cep__.addEventListener(type, listener, obj);
      } catch (e) {
        console.error('[CSInterface] addEventListener error:', e);
      }
    }
  };

  CSInterface.prototype.removeEventListener = function (type, listener, obj) {
    if (window.__adobe_cep__) {
      try {
        window.__adobe_cep__.removeEventListener(type, listener, obj);
      } catch (e) {
        console.error('[CSInterface] removeEventListener error:', e);
      }
    }
  };

  CSInterface.prototype.dispatchEvent = function (event) {
    if (window.__adobe_cep__ && event) {
      try {
        window.__adobe_cep__.dispatchEvent(event);
      } catch (e) {
        console.error('[CSInterface] dispatchEvent error:', e);
      }
    }
  };

  CSInterface.prototype.closeExtension = function () {
    if (window.__adobe_cep__) {
      window.__adobe_cep__.closeExtension();
    }
  };

  CSInterface.prototype.requestOpenExtension = function (extensionId, params) {
    if (window.__adobe_cep__) {
      window.__adobe_cep__.requestOpenExtension(extensionId, params || '');
    }
  };

  CSInterface.prototype.getCurrentApiVersion = function () {
    if (window.__adobe_cep__) {
      return JSON.parse(window.__adobe_cep__.getCurrentApiVersion());
    }
    return { major: 0, minor: 0, micro: 0 };
  };

  CSInterface.prototype.openURLInDefaultBrowser = function (url) {
    if (window.__adobe_cep__) {
      window.__adobe_cep__.openURLInDefaultBrowser(url);
    }
  };

  // SystemPath constants
  CSInterface.prototype.EXTENSION_PATH = 'extension';
  CSInterface.prototype.USER_DATA = 'userData';
  CSInterface.prototype.COMMON_FILES = 'commonFiles';
  CSInterface.prototype.HOST_APPLICATION = 'hostApplication';

  return CSInterface;
})();

// Make available globally
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CSInterface;
}
