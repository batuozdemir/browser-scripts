// ==UserScript==
// @name         h5player-lite
// @namespace    https://github.com/xxxily/h5player
// @homepage     https://github.com/xxxily/h5player
// @version      4.3.5.4
// @description  Video speed control. Pruned build of xxxily/h5player.
// @author       ankvps
// @match        *://*/*
// @exclude      *://yiyan.baidu.com/*
// @exclude      *://*.bing.com/search*
// @grant        unsafeWindow
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_getTab
// @grant        GM_saveTab
// @grant        GM_getTabs
// @grant        GM_openInTab
// @grant        GM_setClipboard
// @run-at       document-start
// @license      GPL-3.0-or-later
// @downloadURL https://raw.githubusercontent.com/batuozdemir/browser-scripts/main/h5player/h5player-lite.user.js
// @updateURL   https://raw.githubusercontent.com/batuozdemir/browser-scripts/main/h5player/h5player-lite.user.js
// ==/UserScript==
(function (w) { if (w) { w.name = 'h5player'; } })();

const originalMethods = {
  Object: {
    defineProperty: Object.defineProperty,
    defineProperties: Object.defineProperties
  },
  setInterval: window.setInterval,
  setTimeout: window.setTimeout,

  HTMLElement: window.HTMLElement,
  customElements: window.customElements,
  customElementsMethods: {
    define: window.customElements.define,
    get: window.customElements.get
  }
};

/**
 */
function ready (selector, fn, shadowRoot) {
  const win = window;
  const docRoot = shadowRoot || win.document.documentElement;
  if (!docRoot) return false
  const MutationObserver = win.MutationObserver || win.WebKitMutationObserver;
  const listeners = docRoot._MutationListeners || [];

  function $ready (selector, fn) {
    listeners.push({
      selector: selector,
      fn: fn
    });

    if (!docRoot._MutationListeners || !docRoot._MutationObserver) {
      docRoot._MutationListeners = listeners;
      docRoot._MutationObserver = new MutationObserver(() => {
        for (let i = 0; i < docRoot._MutationListeners.length; i++) {
          const item = docRoot._MutationListeners[i];
          check(item.selector, item.fn);
        }
      });

      docRoot._MutationObserver.observe(docRoot, {
        childList: true,
        subtree: true
      });
    }

    check(selector, fn);
  }

  function check (selector, fn) {
    const elements = docRoot.querySelectorAll(selector);
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      element._MutationReadyList_ = element._MutationReadyList_ || [];
      if (!element._MutationReadyList_.includes(fn)) {
        element._MutationReadyList_.push(fn);
        fn.call(element, element);
      }
    }
  }

  const selectorArr = Array.isArray(selector) ? selector : [selector];
  selectorArr.forEach(selector => $ready(selector, fn));
}

/**
 * https://developers.google.com/web/fundamentals/web-components/shadowdom?hl=zh-cn#closed
 * https://stackoverflow.com/questions/54954383/override-element-prototype-attachshadow-using-chrome-extension
 */
function hackAttachShadow () {
  if (window._hasHackAttachShadow_) return
  try {
    window._shadowDomList_ = [];
    window.Element.prototype._attachShadow = window.Element.prototype.attachShadow;
    window.Element.prototype.attachShadow = function () {
      const arg = arguments;
      const isClosed = arg[0] && arg[0].mode === 'closed';

      if (arg[0] && arg[0].mode) {
        arg[0].mode = 'open';
      }
      const shadowRoot = this._attachShadow.apply(this, arg);
      window._shadowDomList_.push(shadowRoot);

      shadowRoot._shadowHost = this;

      const shadowEvent = new window.CustomEvent('addShadowRoot', {
        shadowRoot,
        detail: {
          shadowRoot,
          message: 'addShadowRoot',
          time: new Date()
        },
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(shadowEvent);

      if (isClosed) {
        /**
         */
        Object.defineProperty(this, 'shadowRoot', {
          get () {
            return null
          }
        });
      }

      // console.log('addShadowRoot', shadowRoot.host, this, this.shadowRoot)

      return shadowRoot
    };
    window._hasHackAttachShadow_ = true;
  } catch (e) {
    console.error('hackAttachShadow error by h5player plug-in', e);
  }
}

/*!
 * @name         original.js
 * @version      0.0.1
 * @author       xxxily
 * @date         2022/10/16 10:32
 * @github       https://github.com/xxxily
 */

const original = {
  Object: {
    defineProperty: Object.defineProperty,
    defineProperties: Object.defineProperties
  },

  Proxy,

  Map,
  map: {
    clear: Map.prototype.clear,
    set: Map.prototype.set,
    has: Map.prototype.has,
    get: Map.prototype.get,
    delete: Map.prototype.delete
  },

  console: {
    log: console.log,
    info: console.info,
    error: console.error,
    warn: console.warn,
    table: console.table
  },

  ShadowRoot,
  HTMLMediaElement,
  CustomEvent,
  // appendChild: Node.prototype.appendChild,

  JSON: {
    parse: JSON.parse,
    stringify: JSON.stringify
  },

  alert,
  confirm,
  prompt
};

/**
 * @returns mediaElementList
 */
const mediaCore = (function () {
  let hasMediaCoreInit = false;
  let hasProxyHTMLMediaElement = false;
  let originDescriptors = {};
  const originMethods = {};
  const mediaElementList = [];
  const mediaElementHandler = [];
  const mediaMap = new original.Map();

  const firstUpperCase = str => str.replace(/^\S/, s => s.toUpperCase());
  function isHTMLMediaElement (el) {
    return el instanceof original.HTMLMediaElement
  }

  /**
   * @returns mediaPlusApi
   */
  function createMediaPlusApi (mediaElement) {
    if (!isHTMLMediaElement(mediaElement)) { return false }

    let mediaPlusApi = original.map.get.call(mediaMap, mediaElement);
    if (mediaPlusApi) {
      return mediaPlusApi
    }

    mediaPlusApi = {};
    const mediaPlusBaseApi = {
      /**
       */
      lock (keyName, duration) {
        const infoKey = `__${keyName}_info__`;
        mediaPlusApi[infoKey] = mediaPlusApi[infoKey] || {};
        mediaPlusApi[infoKey].lock = true;

        duration = Number(duration);
        if (!Number.isNaN(duration) && duration > 0) {
          mediaPlusApi[infoKey].unLockTime = Date.now() + duration;
        }

        // original.console.log(`[mediaPlusApi][lock][${keyName}] ${duration}`)
      },
      unLock (keyName) {
        const infoKey = `__${keyName}_info__`;
        mediaPlusApi[infoKey] = mediaPlusApi[infoKey] || {};
        mediaPlusApi[infoKey].lock = false;
        mediaPlusApi[infoKey].unLockTime = Date.now() - 100;

        // original.console.log(`[mediaPlusApi][unLock][${keyName}]`)
      },
      isLock (keyName) {
        const info = mediaPlusApi[`__${keyName}_info__`] || {};

        if (info.unLockTime) {
          return Date.now() < info.unLockTime
        } else {
          return info.lock || false
        }
      },

      get (keyName) {
        if (originDescriptors[keyName] && originDescriptors[keyName].get && !originMethods[keyName]) {
          return originDescriptors[keyName].get.apply(mediaElement)
        }
      },
      set (keyName, val) {
        if (originDescriptors[keyName] && originDescriptors[keyName].set && !originMethods[keyName] && typeof val !== 'undefined') {
          return originDescriptors[keyName].set.apply(mediaElement, [val])
        }
      },
      apply (keyName) {
        if (originMethods[keyName] instanceof Function) {
          const args = Array.from(arguments);
          args.shift();
          return originMethods[keyName].apply(mediaElement, args)
        }
      }
    };

    mediaPlusApi = { ...mediaPlusApi, ...mediaPlusBaseApi };

    /**
     * mediaPlusApi.lockPlaybackRate()
     * mediaPlusApi.unLockPlaybackRate()
     * mediaPlusApi.isLockPlaybackRate()
     * mediaPlusApi.getPlaybackRate()
     * mediaPlusApi.setPlaybackRate(val)
     *
     * mediaPlusApi.lockVolume()
     * mediaPlusApi.unLockVolume()
     * mediaPlusApi.isLockVolume()
     * mediaPlusApi.getVolume()
     * mediaPlusApi.setVolume(val)
     *
     * mediaPlusApi.lockCurrentTime()
     * mediaPlusApi.unLockCurrentTime()
     * mediaPlusApi.isLockCurrentTime()
     * mediaPlusApi.getCurrentTime()
     * mediaPlusApi.setCurrentTime(val)
     *
     * mediaPlusApi.lockPlay()
     * mediaPlusApi.unLockPlay()
     * mediaPlusApi.isLockPlay()
     * mediaPlusApi.applyPlay()
     *
     * mediaPlusApi.lockPause()
     * mediaPlusApi.unLockPause()
     * mediaPlusApi.isLockPause()
     * mediaPlusApi.applyPause()
     */
    const extApiKeys = ['playbackRate', 'volume', 'currentTime', 'play', 'pause'];
    const baseApiKeys = Object.keys(mediaPlusBaseApi);
    extApiKeys.forEach(key => {
      baseApiKeys.forEach(baseKey => {
        if (originMethods[key] instanceof Function) {
          if (baseKey === 'get' || baseKey === 'set') {
            return true
          }
        } else if (baseKey === 'apply') {
          return true
        }

        mediaPlusApi[`${baseKey}${firstUpperCase(key)}`] = function () {
          return mediaPlusBaseApi[baseKey].apply(null, [key, ...arguments])
        };
      });
    });

    original.map.set.call(mediaMap, mediaElement, mediaPlusApi);

    return mediaPlusApi
  }

  function mediaDetectHandler (ctx) {
    if (isHTMLMediaElement(ctx) && !mediaElementList.includes(ctx)) {
      // console.log(`[mediaDetectHandler]`, ctx)
      mediaElementList.push(ctx);
      createMediaPlusApi(ctx);

      try {
        mediaElementHandler.forEach(handler => {
          (handler instanceof Function) && handler(ctx);
        });
      } catch (e) {}
    }
  }

  function proxyPrototypeMethod (element, methodName) {
    const originFunc = element && element.prototype[methodName];
    if (!originFunc) return

    element.prototype[methodName] = new original.Proxy(originFunc, {
      apply (target, ctx, args) {
        mediaDetectHandler(ctx);

        if (['play', 'pause'].includes(methodName)) {
          const mediaPlusApi = createMediaPlusApi(ctx);
          if (mediaPlusApi && mediaPlusApi.isLock(methodName)) {
            return
          }
        }

        const result = target.apply(ctx, args);


        return result
      }
    });

    // if (originMethods[methodName]) {
    //   element.prototype[`__${methodName}__`] = originMethods[methodName]
    // }
  }

  /**
   */
  function hijackPrototypeProperty (element, property) {
    if (!element || !element.prototype || !originDescriptors[property]) {
      return false
    }

    original.Object.defineProperty.call(Object, element.prototype, property, {
      configurable: true,
      enumerable: true,
      get: function () {
        const val = originDescriptors[property].get.apply(this, arguments);
        // original.console.log(`[mediaElementPropertyHijack][${property}][get]`, val)

        const mediaPlusApi = createMediaPlusApi(this);
        if (mediaPlusApi && mediaPlusApi.isLock(property)) {
          if (property === 'playbackRate') {
            return +!+[]
          }
        }

        return val
      },
      set: function (value) {
        // original.console.log(`[mediaElementPropertyHijack][${property}][set]`, value)

        if (property === 'src') {
          mediaDetectHandler(this);
        }

        if (['playbackRate', 'volume', 'currentTime'].includes(property)) {
          const mediaPlusApi = createMediaPlusApi(this);
          if (mediaPlusApi && mediaPlusApi.isLock(property)) {
            return
          }
        }

        return originDescriptors[property].set.apply(this, arguments)
      }
    });
  }

  function mediaPlus (mediaElement) {
    return createMediaPlusApi(mediaElement)
  }

  function mediaProxy () {
    if (!hasProxyHTMLMediaElement) {
      const proxyMethods = ['play', 'pause', 'load', 'addEventListener'];
      proxyMethods.forEach(methodName => { proxyPrototypeMethod(HTMLMediaElement, methodName); });

      const hijackProperty = ['playbackRate', 'volume', 'currentTime', 'src'];
      hijackProperty.forEach(property => { hijackPrototypeProperty(HTMLMediaElement, property); });

      hasProxyHTMLMediaElement = true;
    }

    return hasProxyHTMLMediaElement
  }

  /**
   * @returns mediaElementList
   */
  function mediaChecker (handler) {
    if (!(handler instanceof Function) || mediaElementHandler.includes(handler)) {
      return mediaElementList
    } else {
      mediaElementHandler.push(handler);
    }

    if (!hasProxyHTMLMediaElement) {
      mediaProxy();
    }

    return mediaElementList
  }

  /**
   */
  function init (mediaCheckerHandler) {
    if (hasMediaCoreInit) { return false }

    originDescriptors = Object.getOwnPropertyDescriptors(HTMLMediaElement.prototype);

    Object.keys(HTMLMediaElement.prototype).forEach(key => {
      try {
        if (HTMLMediaElement.prototype[key] instanceof Function) {
          originMethods[key] = HTMLMediaElement.prototype[key];
        }
      } catch (e) {}
    });

    mediaCheckerHandler = mediaCheckerHandler instanceof Function ? mediaCheckerHandler : function () {};
    mediaChecker(mediaCheckerHandler);

    hasMediaCoreInit = true;
    return true
  }

  return {
    init,
    mediaPlus,
    mediaChecker,
    originDescriptors,
    originMethods,
    mediaElementList
  }
})();

/*!
 * @name         utils.js
 * @version      0.0.1
 * @author       Blaze
 * @date         22/03/2019 22:46
 * @github       https://github.com/xxxily
 */

/**
 */
function getType (obj) {
  if (obj == null) {
    return String(obj)
  }
  return typeof obj === 'object' || typeof obj === 'function'
    ? (obj.constructor && obj.constructor.name && obj.constructor.name.toLowerCase()) ||
    /function\s(.+?)\(/.exec(obj.constructor)[1].toLowerCase()
    : typeof obj
}

const isType = (obj, typeName) => getType(obj) === typeName;
const isObj$1 = obj => isType(obj, 'object');

/*!
 * @name         object.js
 * @version      0.0.1
 * @author       Blaze
 * @date         21/03/2019 23:10
 * @github       https://github.com/xxxily
 */

/**
 */
function clone (source) {
  var result = {};

  if (typeof source !== 'object') {
    return source
  }
  if (Object.prototype.toString.call(source) === '[object Array]') {
    result = [];
  }
  if (Object.prototype.toString.call(source) === '[object Null]') {
    result = null;
  }
  for (var key in source) {
    result[key] = (typeof source[key] === 'object') ? clone(source[key]) : source[key];
  }
  return result
}

function forIn (obj, fn) {
  fn = fn || function () {};
  for (var key in obj) {
    if (Object.hasOwnProperty.call(obj, key)) {
      fn(key, obj[key]);
    }
  }
}

/**
 * @returns {*|void}
 */
function mergeObj (objA, objB, concatArr) {
  function isObj (obj) {
    return Object.prototype.toString.call(obj) === '[object Object]'
  }
  function isArr (arr) {
    return Object.prototype.toString.call(arr) === '[object Array]'
  }
  if (!isObj(objA) || !isObj(objB)) return objA
  function deepMerge (objA, objB) {
    forIn(objB, function (key) {
      const subItemA = objA[key];
      const subItemB = objB[key];
      if (typeof subItemA === 'undefined') {
        objA[key] = subItemB;
      } else {
        if (isObj(subItemA) && isObj(subItemB)) {
          objA[key] = deepMerge(subItemA, subItemB);
        } else {
          if (concatArr && isArr(subItemA) && isArr(subItemB)) {
            objA[key] = subItemA.concat(subItemB);
          } else {
            objA[key] = subItemB;
          }
        }
      }
    });
    return objA
  }
  return deepMerge(objA, objB)
}

/**
 * @returns {*}
 */
function getValByPath$1 (obj, path) {
  path = path || '';
  const pathArr = path.split('.');
  let result = obj;

  for (let i = 0; i < pathArr.length; i++) {
    if (!result) break
    result = result[pathArr[i]];
  }

  return result
}

/**
 */
function setValByPath (obj, path, val) {
  if (!obj || !path || typeof path !== 'string') {
    return false
  }

  let result = obj;
  const pathArr = path.split('.');

  for (let i = 0; i < pathArr.length; i++) {
    if (!result) break

    if (i === pathArr.length - 1) {
      result[pathArr[i]] = val;
      return Number.isNaN(val) ? Number.isNaN(result[pathArr[i]]) : result[pathArr[i]] === val
    }

    result = result[pathArr[i]];
  }

  return false
}

const quickSort = function (arr) {
  if (arr.length <= 1) { return arr }
  var pivotIndex = Math.floor(arr.length / 2);
  var pivot = arr.splice(pivotIndex, 1)[0];
  var left = [];
  var right = [];
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] < pivot) {
      left.push(arr[i]);
    } else {
      right.push(arr[i]);
    }
  }
  return quickSort(left).concat([pivot], quickSort(right))
};

function hideDom (selector, delay) {
  setTimeout(function () {
    const dom = document.querySelector(selector);
    if (dom) {
      dom.style.opacity = 0;
    }
  }, delay || 1000 * 5);
}

/**
 */
function eachParentNode (dom, fn) {
  let parent = dom.parentNode;
  while (parent) {
    const isEnd = fn(parent, dom);
    parent = parent.parentNode;
    if (isEnd) {
      break
    }
  }
}

/**
 * @returns {HTMLStyleElement}
 */
function loadCSSText (cssText, id, insetTo) {
  if (id && document.getElementById(id)) {
    return false
  }

  const style = document.createElement('style');
  const head = insetTo || document.head || document.getElementsByTagName('head')[0];
  style.appendChild(document.createTextNode(cssText));
  head.appendChild(style);

  if (id) {
    style.setAttribute('id', id);
  }

  return style
}

/**
 * @param target
 * @returns Boolean
 */
function isEditableTarget (target) {
  const isEditable = target.getAttribute && target.getAttribute('contenteditable') === 'true';
  const isInputDom = /INPUT|TEXTAREA|SELECT|LABEL/.test(target.nodeName);
  return isEditable || isInputDom
}

/**
 * @param node
 * @returns {boolean}
 */
function isInShadow (node, returnShadowRoot) {
  for (; node; node = node.parentNode) {
    if (node.toString() === '[object ShadowRoot]') {
      if (returnShadowRoot) {
        return node
      } else {
        return true
      }
    }
  }
  return false
}

/**
 * @param element
 * @returns {boolean}
 */
function isInViewPort (element) {
  const viewWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewHeight = window.innerHeight || document.documentElement.clientHeight;
  const {
    top,
    right,
    bottom,
    left
  } = element.getBoundingClientRect();

  return (
    top >= 0 &&
    left >= 0 &&
    right <= viewWidth &&
    bottom <= viewHeight
  )
}

/**
 * @param { Function } callback
 * @param { Element } element
 * @returns { IntersectionObserver }
 */
function observeVisibility (callback, element) {
  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        callback(entry, observer);
      } else {
        callback(null, observer);
      }
    });
  });

  if (element) {
    observer.observe(element);
  }

  return observer
}

// const temp1 = document.querySelector('#temp1')
// var observer = observeVisibility(function (entry, observer) {
//   if (entry) {
//     console.log('[entry]', entry)
//   } else {
//     console.log('[entry]', 'null')
//   }
// }, temp1)

/**
 * @param {*} element
 * @returns
 */
function isOutOfDocument (element) {
  if (!element || element.offsetParent === null) {
    return true
  }

  if (element.style.visibility === 'hidden' || element.style.display === 'none') { return true }

  const {
    top,
    right,
    bottom,
    left,
    width,
    height
  } = element.getBoundingClientRect();

  return (
    top === 0 &&
    right === 0 &&
    bottom === 0 &&
    left === 0 &&
    width === 0 &&
    height === 0
  )
}

/**
 */
function isCoordinateInElement (x, y, element) {
  if (!element || !element.getBoundingClientRect) { return false }

  const rect = element.getBoundingClientRect();

  if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
    return true
  } else {
    return false
  }
}

/**
 * https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/trusted-types
 * @returns
 */
function createTrustedHTML (htmlString) {
  if (window.trustedTypes && window.trustedTypes.createPolicy) {
    let policy = window.trustedTypes.defaultPolicy || null;
    if (!policy) {
      policy = window.trustedTypes.createPolicy('default', {
        createHTML: (string) => string
      });
    }

    const trustedHTML = policy.createHTML(htmlString);

    return trustedHTML
  } else {
    return htmlString
  }
}

/**
 */
function parseHTML (htmlString, targetElement) {
  if (typeof htmlString !== 'string') {
    throw new Error('[parseHTML] Input must be a string')
  }

  const trustedHTML = createTrustedHTML(htmlString);

  const parser = new DOMParser();
  const doc = parser.parseFromString(trustedHTML, 'text/html');
  const nodes = doc.body.childNodes;
  const result = [];

  if (targetElement && targetElement.appendChild) {
    nodes.forEach(node => {
      const targetNode = node.cloneNode(true);
      try {
        targetElement.appendChild(targetNode);
      } catch (e) {
        console.error('[parseHTML] appendChild error', e, targetElement, targetNode);
      }
      result.push(targetNode);
    });
  }

  return result.length ? result : nodes
}

/**
 * @returns {Object}
 */

function inlineStyleToObj (inlineStyle) {
  if (typeof inlineStyle !== 'string') {
    return {}
  }

  const result = {};
  const styArr = inlineStyle.split(';');
  styArr.forEach(item => {
    const tmpArr = item.split(':');
    if (tmpArr.length === 2) {
      result[tmpArr[0].trim()] = tmpArr[1].trim();
    }
  });

  return result
}

function objToInlineStyle (obj) {
  if (Object.prototype.toString.call(obj) !== '[object Object]') {
    return ''
  }

  const styleArr = [];
  Object.keys(obj).forEach(key => {
    styleArr.push(`${key}: ${obj[key]}`);
  });

  return styleArr.join('; ')
}

function fakeUA (ua) {
  // Object.defineProperty(navigator, 'userAgent', {
  //   value: ua,
  //   writable: false,
  //   configurable: false,
  //   enumerable: true
  // })

  const desc = Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgent');
  Object.defineProperty(Navigator.prototype, 'userAgent', { ...desc, get: function () { return ua } });
}

const userAgentMap = {
  android: {
    chrome: 'Mozilla/5.0 (Linux; Android 9; SM-G960F Build/PPR1.180610.011; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/74.0.3729.157 Mobile Safari/537.36',
    firefox: 'Mozilla/5.0 (Android 7.0; Mobile; rv:57.0) Gecko/57.0 Firefox/57.0'
  },
  iPhone: {
    safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/111.0.0.0 Mobile/15E148 Safari/604.1',
    chrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/74.0.3729.121 Mobile/15E148 Safari/605.1'
  },
  iPad: {
    safari: 'Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1',
    chrome: 'Mozilla/5.0 (iPad; CPU OS 12_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/74.0.3729.155 Mobile/15E148 Safari/605.1'
  },
  mac: {
    safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.1 Safari/605.1.15',
    chrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5) AppleWebKit/537.36 (KHTML, like Firefox) Chrome/74.0.3729.157 Safari/537.36'
  }
};

/**
 * @returns {boolean}
 */
function isInIframe () {
  return window !== window.top
}

/**
 * @returns {boolean}
 */
function isInCrossOriginFrame () {
  let result = true;
  try {
    if (window.top.localStorage || window.top.location.href) {
      result = false;
    }
  } catch (e) {
    result = true;
  }
  return result
}

/**
 * @param fn
 * @param interval
 * @returns {Function}
 */
function throttle (fn, interval = 80) {
  let timeout = null;
  return function () {
    if (timeout) return false
    timeout = setTimeout(() => {
      timeout = null;
    }, interval);
    fn.apply(this, arguments);
  }
}

/*!
 * @name         url.js
 * @version      0.0.1
 * @author       Blaze
 * @date         27/03/2019 15:52
 * @github       https://github.com/xxxily
 */

/**
 * https://segmentfault.com/a/1190000006215495
 */

function parseURL (url) {
  var a = document.createElement('a');
  a.href = url || window.location.href;
  return {
    source: url,
    protocol: a.protocol.replace(':', ''),
    host: a.hostname,
    port: a.port,
    origin: a.origin,
    search: a.search,
    query: a.search,
    file: (a.pathname.match(/\/([^/?#]+)$/i) || ['', ''])[1],
    hash: a.hash.replace('#', ''),
    path: a.pathname.replace(/^([^/])/, '/$1'),
    relative: (a.href.match(/tps?:\/\/[^/]+(.+)/) || ['', ''])[1],
    params: (function () {
      var ret = {};
      var seg = [];
      var paramArr = a.search.replace(/^\?/, '').split('&');

      for (var i = 0; i < paramArr.length; i++) {
        var item = paramArr[i];
        if (item !== '' && item.indexOf('=')) {
          seg.push(item);
        }
      }

      for (var j = 0; j < seg.length; j++) {
        var param = seg[j];
        var idx = param.indexOf('=');
        var key = param.substring(0, idx);
        var val = param.substring(idx + 1);
        if (!key) {
          ret[val] = null;
        } else {
          ret[key] = val;
        }
      }
      return ret
    })()
  }
}

/**
 * @returns {string}
 */
function stringifyParams (params) {
  var strArr = [];

  if (!Object.prototype.toString.call(params) === '[object Object]') {
    return ''
  }

  for (var key in params) {
    if (Object.hasOwnProperty.call(params, key)) {
      var val = params[key];
      var valType = Object.prototype.toString.call(val);

      if (val === '' || valType === '[object Undefined]') continue

      if (val === null) {
        strArr.push(key);
      } else if (valType === '[object Array]') {
        strArr.push(key + '=' + val.join(','));
      } else {
        val = (JSON.stringify(val) || '' + val).replace(/(^"|"$)/g, '');
        strArr.push(key + '=' + val);
      }
    }
  }
  return strArr.join('&')
}

/**
 */
function stringifyToUrl (urlObj) {
  var query = stringifyParams(urlObj.params) || '';
  if (query) { query = '?' + query; }
  var hash = urlObj.hash ? '#' + urlObj.hash : '';
  return urlObj.origin + urlObj.path + query + hash
}

const hasUseKey = {
  keyCodeList: [13, 16, 17, 18, 27, 32, 37, 38, 39, 40, 49, 50, 51, 52, 67, 68, 69, 70, 73, 74, 75, 77, 78, 79, 80, 81, 82, 83, 84, 85, 87, 88, 89, 90, 97, 98, 99, 100, 220],
  keyList: ['enter', 'shift', 'control', 'alt', 'escape', ' ', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', '1', '2', '3', '4', 'c', 'd', 'e', 'f', 'i', 'j', 'k', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'w', 'x', 'y', 'z', '\\', '|'],
  keyMap: {
    enter: 13,
    shift: 16,
    ctrl: 17,
    alt: 18,
    esc: 27,
    space: 32,
    '←': 37,
    '↑': 38,
    '→': 39,
    '↓': 40,
    1: 49,
    2: 50,
    3: 51,
    4: 52,
    c: 67,
    d: 68,
    e: 69,
    f: 70,
    i: 73,
    j: 74,
    k: 75,
    m: 77,
    n: 78,
    o: 79,
    p: 80,
    q: 81,
    r: 82,
    s: 83,
    t: 84,
    u: 85,
    w: 87,
    x: 88,
    y: 89,
    z: 90,
    pad1: 97,
    pad2: 98,
    pad3: 99,
    pad4: 100,
    '\\': 220
  }
};

/**
 */
function isRegisterKey (event) {
  const keyCode = event.keyCode;
  const key = event.key.toLowerCase();
  return hasUseKey.keyCodeList.includes(keyCode) ||
    hasUseKey.keyList.includes(key)
}

/**
 * @returns {Promise<void>}
 */
async function getPageWindow () {
  return new Promise(function (resolve, reject) {
    if (window._pageWindow) {
      return resolve(window._pageWindow)
    }

    try {
      const pageWin = getPageWindowSync();
      if (pageWin && pageWin.document && pageWin.XMLHttpRequest) {
        window._pageWindow = pageWin;
        resolve(pageWin);
        return pageWin
      }
    } catch (e) {}


    const listenEventList = ['load', 'mousemove', 'scroll', 'get-page-window-event'];

    function getWin (event) {
      window._pageWindow = this;
      // debug.log('getPageWindow succeed', event)
      listenEventList.forEach(eventType => {
        window.removeEventListener(eventType, getWin, true);
      });
      resolve(window._pageWindow);
    }

    listenEventList.forEach(eventType => {
      window.addEventListener(eventType, getWin, true);
    });

    window.dispatchEvent(new window.Event('get-page-window-event'));
  })
}
getPageWindow();

/**
 * @returns {*}
 */
function getPageWindowSync (rawFunction) {
  if (window.unsafeWindow) return window.unsafeWindow
  if (document._win_) return document._win_

  try {
    rawFunction = rawFunction || window.__rawFunction__ || Function.prototype.constructor;
    // return rawFunction('return window')()
    // Function('return (function(){}.constructor("return this")());')
    return rawFunction('return (function(){}.constructor("var getPageWindowSync=1; return this")());')()
  } catch (e) {
    console.error('getPageWindowSync error', e);

    const head = document.head || document.querySelector('head');
    const script = document.createElement('script');
    script.appendChild(document.createTextNode('document._win_ = window'));
    head.appendChild(script);

    return document._win_
  }
}

function openInTab (url, opts, referer) {
  // fix tampermonkey menu bug start

  const now = Date.now();
  const sessionKey = `h5player_openTab_${url}`;
  let lastOpenTime = 0;

  if (window.GM_getValue && window.GM_setValue) {
    lastOpenTime = window.GM_getValue(sessionKey, 0);

    if (lastOpenTime && (now - lastOpenTime) < 1000) {
      return
    }

    window.GM_setValue(sessionKey, now);
  } else {
    lastOpenTime = sessionStorage.getItem(sessionKey);

    if (lastOpenTime && (now - parseInt(lastOpenTime)) < 1000) {
      return
    }

    sessionStorage.setItem(sessionKey, now.toString());
  }
  // fix tampermonkey menu bug end

  if (referer) {
    const urlObj = parseURL(url);
    if (!urlObj.params.referer) {
      urlObj.params.referer = encodeURIComponent(window.location.href);
      url = stringifyToUrl(urlObj);
    }
  }

  if (window.GM_openInTab) {
    window.GM_openInTab(url, opts || {
      active: true,
      insert: true,
      setParent: true
    });
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'inline-block';
    a.style.width = '1px';
    a.style.height = '1px';
    a.style.opcity = 0;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); }, 300);
  }
}

function numUp (num) {
  if (typeof num === 'number' && num < 0) {
    num = Math.abs(num);
  }
  return num
}

function numDown (num) {
  if (typeof num === 'number' && num > 0) {
    num = -num;
  }
  return num
}

function isMediaElement (element) {
  return element && (element instanceof HTMLMediaElement || element.HTMLMediaElement || element.HTMLVideoElement || element.HTMLAudioElement)
}

function isVideoElement (element) {
  return element && (element instanceof HTMLVideoElement || element.HTMLVideoElement)
}

function isAudioElement (element) {
  return element && (element instanceof HTMLAudioElement || element.HTMLAudioElement)
}

/*!
 * configManager parse localStorage error * @name         configManager.ts
 * @version      0.0.1
 * @author       xxxily
 * @date         2023/03/06 14:29
 * @github       https://github.com/xxxily
 */


/**
 * https://stackoverflow.com/questions/30481516/iframe-in-chrome-error-failed-to-read-localstorage-from-window-access-deni
 */
function isLocalStorageUsable () {
  return window.localStorage && window.localStorage.getItem instanceof Function && window.localStorage.setItem instanceof Function
}

/**
 * https://www.tampermonkey.net/documentation.php?ext=dhdg#GM_setValue
 */
function isGlobalStorageUsable () {
  return window.GM_setValue && window.GM_getValue && window.GM_deleteValue && window.GM_listValues instanceof Function
}

/**
 */
const rawLocalStorage = (function getRawLocalStorage () {
  const localStorageApis = ['getItem', 'setItem', 'removeItem', 'clear', 'key'];

  const rawLocalStorage = {};

  localStorageApis.forEach((apiKey) => {
    if (isLocalStorageUsable()) {
      rawLocalStorage[`_${apiKey}_`] = localStorage[apiKey];
      rawLocalStorage[apiKey] = function () {
        return rawLocalStorage[`_${apiKey}_`].apply(localStorage, arguments)
      };
    } else {
      rawLocalStorage[apiKey] = function () {
        console.error('localStorage unavailable');
      };
    }
  });

  return rawLocalStorage
})();

class ConfigManager {
  constructor (opts) {
    this.opts = opts;
  }

  isLocalStorageUsable = isLocalStorageUsable
  isGlobalStorageUsable = isGlobalStorageUsable

  /**
   * @returns {keyName}
   */
  getConfKeyName (confPath = '') {
    return this.opts.prefix + confPath.replace(/\./g, '_')
  }

  /**
   * @returns {confPath}
   */
  getConfPath (keyName = '') {
    return keyName.replace(this.opts.prefix, '').replace(/_/g, '.')
  }

  getConfPathList (config) {
    const confPathList = [];

    function getConfPathList (config, path = '') {
      Object.keys(config).forEach((key) => {
        const pathKey = path ? `${path}.${key}` : key;
        if (Object.prototype.toString.call(config[key]) === '[object Object]') {
          getConfPathList(config[key], pathKey);
        } else {
          confPathList.push(pathKey);
        }
      });
    }
    getConfPathList(config);

    return confPathList
  }

  /**
   */
  get (confPath) {
    if (typeof confPath !== 'string') {
      return null
    }

    const localConf = this.getLocalStorage(confPath);
    if (localConf !== null && localConf !== undefined) {
      return localConf
    }

    const globalConf = this.getGlobalStorage(confPath);
    if (globalConf !== null && globalConf !== undefined) {
      return globalConf
    }

    return this.getMemoryStorage(confPath)
  }

  /**
   * @param {String} confPath
   * @param {*} val
   * @returns {Boolean}
   */
  set (confPath, val) {
    if (typeof confPath !== 'string' || typeof val === 'undefined' || val === null) {
      return false
    }

    setValByPath(this.opts.config, confPath, val);

    let sucStatus = false;

    sucStatus = this.setLocalStorage(confPath, val);

    if (!sucStatus) {
      sucStatus = this.setGlobalStorage(confPath, val);
    }

    return sucStatus
  }

  list () {
    const result = {
      localConf: this.listLocalStorage(),
      globalConf: this.listGlobalStorage(),
      defConfig: this.opts.config
    };
    return result
  }

  clear () {
    this.clearLocalStorage();
    this.clearGlobalStorage();
  }

  getMemoryStorage (confPath) {
    if (typeof confPath !== 'string') { return null }

    const config = this.getConfObj();
    const val = getValByPath$1(config, confPath);
    if (typeof val !== 'undefined' && val !== null) {
      return val
    } else {
      return null
    }
  }

  /**
   * @returns
   */
  getLocalStorage (confPath) {
    if (typeof confPath !== 'string') {
      return null
    }

    const key = this.getConfKeyName(confPath);

    if (isLocalStorageUsable()) {
      let localConf = rawLocalStorage.getItem(key);
      if (localConf !== null && localConf !== undefined) {
        try {
          localConf = JSON.parse(localConf);
        } catch (e) {
          console.error('configManager parse localStorage error:', key, localConf);
        }

        return localConf
      } else {
        return this.getMemoryStorage(confPath)
      }
    }

    return null
  }

  /**
   * @returns
   */
  getGlobalStorage (confPath) {
    if (typeof confPath !== 'string') {
      return null
    }

    const key = this.getConfKeyName(confPath);

    if (isGlobalStorageUsable()) {
      const globalConf = window.GM_getValue(key);
      if (globalConf !== null && globalConf !== undefined) {
        return globalConf
      } else {
        return this.getMemoryStorage(confPath)
      }
    } else {
      return this.getLocalStorage(confPath)
    }
  }

  setMemoryStorage (confPath, val) {
    if (typeof confPath !== 'string' || typeof val === 'undefined' || val === null) {
      return false
    } else {
      setValByPath(this.opts.config, confPath, val);
      return true
    }
  }

  /**
   * @param {String} confPath
   * @param {*} val
   * @returns {Boolean}
   */
  setLocalStorage (confPath, val) {
    if (typeof confPath !== 'string' || typeof val === 'undefined' || val === null) {
      return false
    }

    setValByPath(this.opts.config, confPath, val);

    const key = this.getConfKeyName(confPath);

    if (isLocalStorageUsable()) {
      try {
        if (Object.prototype.toString.call(val) === '[object Object]' || Array.isArray(val)) {
          val = JSON.stringify(val);
        }

        rawLocalStorage.setItem(key, val);

        return true
      } catch (e) {
        console.error('configManager set localStorage error:', key, val, e);
        return false
      }
    } else {
      return false
    }
  }

  /**
   * @param {String} confPath
   * @param {*} val
   * @returns {Boolean}
   */
  setGlobalStorage (confPath, val) {
    if (typeof confPath !== 'string' || typeof val === 'undefined' || val === null) {
      return false
    }

    setValByPath(this.opts.config, confPath, val);

    const key = this.getConfKeyName(confPath);

    if (isGlobalStorageUsable()) {
      try {
        window.GM_setValue(key, val);
        return true
      } catch (e) {
        console.error('configManager set globalStorage error:', key, val, e);
        return false
      }
    } else {
      return this.setLocalStorage(confPath, val)
    }
  }

  listLocalStorage () {
    if (isLocalStorageUsable()) {
      const result = {};
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith(this.opts.prefix)) {
          const confPath = this.getConfPath(key);
          result[confPath] = this.getLocalStorage(confPath);
        }
      });
      return result
    } else {
      return {}
    }
  }

  listGlobalStorage () {
    if (isGlobalStorageUsable()) {
      const result = {};
      const globalStorage = window.GM_listValues();
      globalStorage.forEach((key) => {
        if (key.startsWith(this.opts.prefix)) {
          const confPath = this.getConfPath(key);
          result[confPath] = this.getGlobalStorage(confPath);
        }
      });
      return result
    } else {
      return {}
    }
  }

  getConfObj () {
    const confList = this.list();

    Object.keys(confList.globalConf).forEach((confPath) => {
      setValByPath(this.opts.config, confPath, confList.globalConf[confPath]);
    });

    Object.keys(confList.localConf).forEach((confPath) => {
      setValByPath(this.opts.config, confPath, confList.localConf[confPath]);
    });

    return this.opts.config
  }

  setLocalStorageByObj (config) {
    const oldConfig = this.getConfObj();
    const confPathList = this.getConfPathList(config);
    confPathList.forEach((confPath) => {
      const oldVal = getValByPath$1(oldConfig, confPath);
      const val = getValByPath$1(config, confPath);

      if (oldVal === val || oldVal === undefined) {
        return
      }

      this.setLocalStorage(confPath, val);
    });
  }

  setGlobalStorageByObj (config) {
    const oldConfig = this.getConfObj();
    const confPathList = this.getConfPathList(config);
    confPathList.forEach((confPath) => {
      const oldVal = getValByPath$1(oldConfig, confPath);
      const val = getValByPath$1(config, confPath);


      if (oldVal === val || oldVal === undefined) {
        return
      }

      // console.log('setGlobalStorageByObj', confPath, val)

      this.setGlobalStorage(confPath, val);
    });
  }

  clearLocalStorage () {
    if (isLocalStorageUsable()) {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith(this.opts.prefix)) {
          rawLocalStorage.removeItem(key);
        }
      });
    }
  }

  clearGlobalStorage () {
    if (isGlobalStorageUsable()) {
      const globalStorage = window.GM_listValues();
      globalStorage.forEach((key) => {
        if (key.startsWith(this.opts.prefix)) {
          window.GM_deleteValue(key);
        }
      });
    }
  }

  mergeDefConf (conf) {
    return mergeObj(this.opts.config, conf)
  }
}

// const myConfig = new ConfigManager({
//   prefix: '_myConfig_',
//   config: {
//     hotkeys: [
//       {
//         key: 'v',
//         command: 'toggleVisible',
//         disabled: false,
//       },
//     ],
//     enable: true,
//     debug: false,
//   },
// })
// myConfig.set('enable', false)
// const hotkeys = myConfig.get('hotkeys')
// hotkeys[0].disabled = true
// myConfig.set('hotkeys', hotkeys)

const configManager = new ConfigManager({
  prefix: '_h5player_',
  config: {
    enable: true,
    media: {
      autoPlay: false,
      playbackRate: 1,
      volume: 1,

      lastPlaybackRate: 1.5,

      allowRestorePlayProgress: {

      },
      progress: {}
    },
    enableHotkeys: true,
    hotkeys: [
      {
        desc: '',
        key: 'shift+enter',
        command: 'setWebFullScreen',
        disabled: false
      },
      {
        desc: '',
        key: 'enter',
        command: 'setFullScreen'
      },
      {
        desc: '',
        key: 'shift+p',
        command: 'togglePictureInPicture'
      },
      {
        desc: '',
        key: 'shift+s',
        command: 'capture'
      },
      {
        desc: '',
        key: 'shift+r',
        command: 'switchRestorePlayProgressStatus'
      },
      {
        desc: '',
        key: 'shift+m',
        command: 'setMirror',
        args: [true]
      },
      {
        desc: '',
        key: 'm',
        command: 'setMirror'
      },
      {
        desc: '',
        key: 'shift+d',
        command: 'mediaDownload'
      },
      {
        desc: ' -0.05',
        key: 'shift+x',
        command: 'setScaleDown',
        args: -0.05
      },
      {
        desc: ' +0.05',
        key: 'shift+c',
        command: 'setScaleUp',
        args: 0.05
      },
      {
        desc: '',
        key: 'shift+z',
        command: 'resetTransform'
      },
      {
        desc: '10px',
        key: 'shift+arrowright',
        command: 'setTranslateRight',
        args: 10
      },
      {
        desc: '10px',
        key: 'shift+arrowleft',
        command: 'setTranslateLeft',
        args: -10
      },
      {
        desc: '10px',
        key: 'shift+arrowup',
        command: 'setTranslateUp',
        args: 10
      },
      {
        desc: '10px',
        key: 'shift+arrowdown',
        command: 'setTranslateDown',
        args: -10
      },
      {
        desc: '5',
        key: 'arrowright',
        command: 'setCurrentTimeUp',
        args: 5
      },
      {
        desc: '5',
        key: 'arrowleft',
        command: 'setCurrentTimeDown',
        args: -5
      },
      {
        desc: '30',
        key: 'ctrl+arrowright',
        command: 'setCurrentTimeUp',
        args: [30]
      },
      {
        desc: '30',
        key: 'ctrl+arrowleft',
        command: 'setCurrentTimeDown',
        args: [-30]
      },
      {
        desc: ' 5%',
        key: 'arrowup',
        command: 'setVolumeUp',
        args: [0.05]
      },
      {
        desc: ' 5%',
        key: 'arrowdown',
        command: 'setVolumeDown',
        args: [-0.05]
      },
      {
        desc: ' 20%',
        key: 'ctrl+arrowup',
        command: 'setVolumeUp',
        args: [0.2]
      },
      {
        desc: ' 20%',
        key: 'ctrl+arrowdown',
        command: 'setVolumeDown',
        args: [-0.2]
      },
      {
        desc: '/',
        key: 'space',
        command: 'switchPlayStatus'
      },
      {
        desc: '',
        key: 'x',
        command: 'setPlaybackRateDown',
        args: -0.1
      },
      {
        desc: '',
        key: 'c',
        command: 'setPlaybackRateUp',
        args: 0.1
      },
      {
        desc: '',
        key: 'z',
        command: 'resetPlaybackRate'
      },
      {
        desc: '1x',
        key: 'Digit1',
        command: 'setPlaybackRatePlus',
        args: 1
      },
      {
        desc: '1x',
        key: 'Numpad1',
        command: 'setPlaybackRatePlus',
        args: 1
      },
      {
        desc: '2x',
        key: 'Digit2',
        command: 'setPlaybackRatePlus',
        args: 2
      },
      {
        desc: '2x',
        key: 'Numpad2',
        command: 'setPlaybackRatePlus',
        args: 2
      },
      {
        desc: '3x',
        key: 'Digit3',
        command: 'setPlaybackRatePlus',
        args: 3
      },
      {
        desc: '3x',
        key: 'Numpad3',
        command: 'setPlaybackRatePlus',
        args: 3
      },
      {
        desc: '4x',
        key: 'Digit4',
        command: 'setPlaybackRatePlus',
        args: 4
      },
      {
        desc: '4x',
        key: 'Numpad4',
        command: 'setPlaybackRatePlus',
        args: 4
      },
      {
        desc: '',
        key: 'F',
        command: 'freezeFrame',
        args: 1
      },
      {
        desc: '',
        key: 'D',
        command: 'freezeFrame',
        args: -1
      },
      {
        desc: '',
        key: 'E',
        command: 'setBrightnessUp'
      },
      {
        desc: '',
        key: 'W',
        command: 'setBrightnessDown'
      },
      {
        desc: '',
        key: 'T',
        command: 'setContrastUp'
      },
      {
        desc: '',
        key: 'R',
        command: 'setContrastDown'
      },
      {
        desc: '',
        key: 'U',
        command: 'setSaturationUp'
      },
      {
        desc: '',
        key: 'Y',
        command: 'setSaturationDown'
      },
      {
        desc: '',
        key: 'O',
        command: 'setHueUp'
      },
      {
        desc: '',
        key: 'I',
        command: 'setHueDown'
      },
      {
        desc: ' 1 px',
        key: 'K',
        command: 'setBlurUp'
      },
      {
        desc: ' 1 px',
        key: 'J',
        command: 'setBlurDown'
      },
      {
        desc: '',
        key: 'Q',
        command: 'resetFilterAndTransform'
      },
      {
        desc: ' 90 ',
        key: 'S',
        command: 'setRotate'
      },
      {
        desc: '',
        key: 'N',
        command: 'setNextVideo'
      },
      {
        desc: 'debugger',
        key: 'ctrl+shift+alt+d',
        command: 'debuggerNow'
      },
      {
        desc: 'JS',
        key: 'ctrl+j ctrl+s',
        command: () => {
          alert('JS');
        },
        when: ''
      }
    ],
    mouse: {
      enable: false,
      longPressTime: 600
    },
    ui: {
      enable: true,
      alwaysShow: false,

      mod: {
        recommend: {
          enable: false
        }
      }
    },
    download: {
      enable: true
    },
    enhance: {
      blockSetPlaybackRate: true,

      blockSetCurrentTime: false,
      blockSetVolume: false,
      allowExperimentFeatures: false,
      allowExternalCustomConfiguration: false,
      allowAcousticGain: false,
      allowCrossOriginControl: true,
      unfoldMenu: false
    },
    language: 'auto',
    debug: false,
    blacklist: {
      /**
       */
      urls: [
        'https://www.bilibili.com/'
      ],
      domains: [
        'challenges.cloudflare.com'
      ]
    }
  }
});

/* h5player-lite config override — injected by build.sh immediately before
 * `async function initUiConfigManager`, in the same scope as `configManager`.
 *
 * Why the clearing step: ConfigManager.get() resolves localStorage -> GM storage
 * -> defaults, and getConfObj() syncs any stored key back into the live config
 * object on every call. setMemoryStorage writes the lowest (defaults) tier, so a
 * leftover stored value would win over everything below. We delete our three keys
 * from both tiers on every load before writing our values.
 *
 * Consequence: do NOT set these three keys from h5player's own config menu. The
 * menu writes the stored tiers, which are wiped on the next page load.
 *
 * GM_deleteValue is guarded because the Safari Userscripts app implements only
 * the async GM.* API; the sync GM_* set is absent there and the guard makes the
 * GM tier a no-op. Violentmonkey has the full sync set, so both tiers are live.
 */
;(function () {
  const KEYS = [
    '_h5player_hotkeys',
    '_h5player_ui_enable',
    '_h5player_enhance_allowCrossOriginControl'
  ]
  KEYS.forEach(function (k) {
    try { localStorage.removeItem(k) } catch (e) {}
    try { window.GM_deleteValue && window.GM_deleteValue(k) } catch (e) {}
  })

  /* Toolbar/menu off. */
  configManager.setMemoryStorage('ui.enable', false)

  /* Off so the cross-tab `videoDetected` listener cannot make h5player swallow
   * keypresses on pages that have no video of their own. Live on Violentmonkey,
   * dead code on Safari. */
  configManager.setMemoryStorage('enhance.allowCrossOriginControl', false)

  /* Replaces the entire default hotkey table. Turkish-Q layout; the `i` is the
   * dotted i on the home row, not the dotless one on the top row.
   * Known and accepted: `l` and `i` override YouTube's seek-forward-10s and
   * miniplayer while a video is present. */
  configManager.setMemoryStorage('hotkeys', [
    { desc: 'Slower (-0.2x)',      key: 'ç',       command: 'setPlaybackRateDown', args: -0.2 },
    { desc: 'Faster (+0.2x)',      key: '.',       command: 'setPlaybackRateUp',   args: 0.2 },
    { desc: '1x',                 key: 'l',       command: 'setPlaybackRatePlus', args: 1 },
    { desc: '1.5x',               key: 'ş',       command: 'setPlaybackRatePlus', args: 1.5 },
    { desc: '2x',                 key: 'i',       command: 'setPlaybackRatePlus', args: 2 },
    { desc: 'Toggle 1x / last',   key: 'z',       command: 'resetPlaybackRate' },
    { desc: 'Screenshot',         key: 'shift+s', command: 'capture' },
    { desc: 'Picture in picture', key: 'shift+p', command: 'togglePictureInPicture' },
    { desc: 'Resume progress',    key: 'shift+r', command: 'switchRestorePlayProgressStatus' },

    /* shift+enter is upstream's own binding for this. Plain `enter` is upstream's
     * setFullScreen and stays unbound on purpose: it was the reason for this whole
     * config override. */
    { desc: 'Web fullscreen',     key: 'shift+enter',      command: 'setWebFullScreen' },

    /* Seek goes through the per-site TCC table (addCurrentTime/subtractCurrentTime),
     * so sites with their own seek handling are respected. Bound on shift+arrows
     * rather than bare arrows so the site keeps its native seek; the hotkey handler
     * bails on INPUT/TEXTAREA/SELECT/contenteditable, so shift+arrow text selection
     * is unaffected. */
    { desc: 'Forward 5s',         key: 'shift+arrowright', command: 'setCurrentTimeUp',   args: 5 },
    { desc: 'Back 5s',            key: 'shift+arrowleft',  command: 'setCurrentTimeDown', args: -5 }
  ])
})()

async function initUiConfigManager () {
  const isUiConfigPage = location.href.indexOf('h5player.anzz.top/tools/json-editor') > -1 || location.href.indexOf('h5player.anzz.site/tools/json-editor') > -1;
  const isUiConfigMode = location.href.indexOf('saveHandlerName=saveH5PlayerConfig') > -1;
  if (!isUiConfigPage || !isUiConfigMode) return

  function init (pageWindow) {
    const config = JSON.parse(JSON.stringify(configManager.getConfObj()));
    delete config.recommendList;
    if (Array.isArray(config.hotkeys)) {
      config.hotkeys.forEach(item => {
        if (item.disabled === undefined) {
          item.disabled = false;
        }
      });
    }

    pageWindow.jsonEditor.set(config);

    // pageWindow.jsonEditor.collapseAll()
    pageWindow.jsonEditor.expandAll && pageWindow.jsonEditor.expandAll();

    pageWindow.saveH5PlayerConfig = function (editor) {
      try {
        const defConfig = configManager.getConfObj();
        const newConfig = editor.get();
        newConfig.recommendList = defConfig.recommendList || [];
        configManager.setGlobalStorageByObj(newConfig);
        alert('');
      } catch (e) {
        alert(`${e}`);
      }
    };
  }

  let checkCount = 0;
  function checkJSONEditor (pageWindow) {
    if (!pageWindow.JSONEditor) {
      if (checkCount < 30) {
        setTimeout(() => {
          checkCount++;
          checkJSONEditor(pageWindow);
        }, 200);
      }

      return
    }

    init(pageWindow);
  }

  const pageWindow = await getPageWindow();

  if (!pageWindow) {
    return
  }

  checkJSONEditor(pageWindow);
}
initUiConfigManager();

/**
 **/

let TCC$1 = class TCC {
  constructor (taskConf, doTaskFunc) {
    this.conf = taskConf || {
      /**
       * */
      'demo.demo': {
        fullScreen: '.fullscreen-btn',
        exitFullScreen: '.exit-fullscreen-btn',
        webFullScreen: function () {},
        exitWebFullScreen: '.exit-fullscreen-btn',
        autoPlay: '.player-start-btn',
        pause: '.player-pause',
        play: '.player-play',
        switchPlayStatus: '.player-play',
        playbackRate: function () {},
        currentTime: function () {},
        addCurrentTime: '.add-currenttime',
        subtractCurrentTime: '.subtract-currenttime',
        shortcuts: {
          register: [
            'ctrl+shift+alt+c',
            'ctrl+shift+c',
            'ctrl+alt+c',
            'ctrl+c',
            'c'
          ],
          callback: function (h5Player, taskConf, data) {
            const { event, player } = data;
            console.log(event, player);
          }
        },
        include: /^.*/,
        exclude: /\t/
      }
    };

    this.doTaskFunc = doTaskFunc instanceof Function ? doTaskFunc : function () {};
  }

  setTaskConf (taskConf) { this.conf = taskConf; }

  /**
   * */
  getDomain () {
    const host = window.location.host;
    let domain = host;
    const tmpArr = host.split('.');
    if (tmpArr.length > 2) {
      tmpArr.shift();
      domain = tmpArr.join('.');
    }
    return domain
  }

  /**
   */
  formatTCC (isAll) {
    const t = this;
    const keys = Object.keys(t.conf);
    const domain = t.getDomain();
    const host = window.location.host;

    function formatter (item) {
      const defObj = {
        include: /^.*/,
        exclude: /\t/
      };
      item.include = item.include || defObj.include;
      item.exclude = item.exclude || defObj.exclude;
      return item
    }

    const result = {};
    keys.forEach(function (key) {
      let item = t[key];
      if (isObj$1(item)) {
        if (isAll) {
          item = formatter(item);
          result[key] = item;
        } else {
          if (key === host || key === domain) {
            item = formatter(item);
            result[key] = item;
          }
        }
      }
    });
    return result
  }

  isMatch (taskConf) {
    const url = window.location.href;
    let isMatch = false;
    if (!taskConf.include && !taskConf.exclude) {
      isMatch = true;
    } else {
      if (taskConf.include && taskConf.include.test(url)) {
        isMatch = true;
      }
      if (taskConf.exclude && taskConf.exclude.test(url)) {
        isMatch = false;
      }
    }
    return isMatch
  }

  /**
   */
  getTaskConfig () {
    const t = this;
    if (!t._hasFormatTCC_) {
      t.formatTCC();
      t._hasFormatTCC_ = true;
    }
    const domain = t.getDomain();
    const taskConf = t.conf[window.location.host] || t.conf[domain];

    if (taskConf && t.isMatch(taskConf)) {
      return taskConf
    }

    return {}
  }

  /**
   */
  doTask (taskName, data) {
    const t = this;
    let isDo = false;
    if (!taskName) return isDo
    const taskConf = isObj$1(taskName) ? taskName : t.getTaskConfig();

    if (!isObj$1(taskConf) || !taskConf[taskName]) return isDo

    const task = taskConf[taskName];

    if (task) {
      isDo = t.doTaskFunc(taskName, taskConf, data);
    }

    return isDo
  }
};

class Debug {
  constructor (config = {}) {
    this.config = {
      msg: '[Debug Msg]',
      trace: false,
      traceGroup: true,
      printTime: false,

      color: '#000000',
      backgroundColor: 'transparent',
      style: '',

      ...config,

      colorMap: {
        info: '#2274A5',
        log: '#95B46A',
        warn: '#F5A623',
        error: '#D33F49',
        ...config.colorMap || {}
      },
      backgroundColorMap: {
        info: '',
        log: '',
        warn: '',
        error: '',
        ...config.backgroundColorMap || {}
      },
      styleMap: {
        info: '',
        log: '',
        warn: '',
        error: '',
        ...config.styleMap || {}
      }
    };

    const debugMethodList = ['log', 'error', 'info', 'warn'];
    debugMethodList.forEach((name) => {
      this[name] = this.createDebugMethod(name);
    });
  }

  create (msg) {
    return new Debug(msg)
  }

  createDebugMethod (name) {
    name = name || 'info';

    const { msg, color, colorMap, backgroundColor, backgroundColorMap, style, styleMap, printTime, trace, traceGroup } = this.config;
    const textColor = colorMap[name] || color;
    const bgColor = backgroundColorMap[name] || backgroundColor;
    const customStyle = styleMap[name] || style;

    return function () {
      if (!window._debugMode_) {
        return false
      }

      const arg = Array.from(arguments);
      const arg0 = arg[0];
      arg.unshift(`color: ${textColor}; background-color: ${bgColor}; ${customStyle}`);

      let timeStr = '';

      if (printTime) {
        const curTime = new Date();
        const H = curTime.getHours();
        const M = curTime.getMinutes();
        const S = curTime.getSeconds();
        timeStr = `[${H}:${M}:${S}] `;
      }

      arg.unshift(`%c ${timeStr}${msg} `);

      if (trace) {
        if (traceGroup) {
          const arg1Str = typeof arg0 === 'string' ? arg0 : Object.prototype.toString.call(arg0);
          console.groupCollapsed(`%c ${timeStr}${msg} ${arg1Str}`, `color: ${textColor}; background-color: ${bgColor}; ${customStyle}`);
          window.console[name].apply(console, arg);
          console.trace();
          console.groupEnd();
        } else {
          window.console[name].apply(console, arg);
          console.trace();
        }
      } else {
        window.console[name].apply(window.console, arg);
      }
    }
  }

  isDebugMode () {
    return Boolean(window._debugMode_)
  }
}

// function demo () {
//   window._debugMode_ = true
//   window.debug = new Debug({
//     msg: '[Debug Message]',
//     colorMap: {
//       info: '#FFFFFF',
//       log: '#FFFFFF'
//     },
//     backgroundColorMap: {
//       info: '#2274A5',
//       log: '#95B46A'
//     },
//     style: 'font-size: 22px; font-weight: bold; padding: 2px 4px; border-radius: 2px;',
//     trace: true,
//     traceGroup: true,
//     printTime: true
//   })

//   window.debug.log('debug mode is on', window.debug)
//   window.debug.info('debug mode is on', window.debug)
//   window.debug.warn('debug mode is on', window.debug)
//   window.debug.error('debug mode is on', window.debug)
// }
// demo()

var Debug$1 = new Debug();

var debug = Debug$1.create({
  msg: '[H5player Msg]',
  trace: false,
  traceGroup: true,
  printTime: false
});

const $q = function (str) { return document.querySelector(str) };

/**
 * */

const taskConf = {
  /**
   * */
  'demo.demo': {
    init: function (h5Player, taskConf) {},
    fullScreen: '.fullscreen-btn',
    exitFullScreen: '.exit-fullscreen-btn',
    webFullScreen: function () {},
    exitWebFullScreen: '.exit-fullscreen-btn',
    autoPlay: '.player-start-btn',
    pause: '.player-pause',
    play: '.player-play',
    afterPlay: function (h5Player, taskConf) {},
    afterPause: function (h5Player, taskConf) {},
    switchPlayStatus: '.player-play',
    playbackRate: function () {},
    currentTime: function () {},
    addCurrentTime: '.add-currenttime',
    subtractCurrentTime: '.subtract-currenttime',
    shortcuts: {
      register: [
        'ctrl+shift+alt+c',
        'ctrl+shift+c',
        'ctrl+alt+c',
        'ctrl+c',
        'c'
      ],
      callback: function (h5Player, taskConf, data) {
        const { event, player } = data;
        console.log(event, player);
      }
    },

    blockSetPlaybackRate: true,
    blockSetCurrentTime: true,
    blockSetVolume: true,

    include: /^.*/,
    exclude: /\t/
  },
  'youtube.com': {
    init: function (h5Player, taskConf) {
      if (h5Player.hasBindSkipAdEvents) { return }
      const startTime = new Date().getTime();
      let skipCount = 0;

      const skipHandler = (element) => {
        const endTime = new Date().getTime();
        const time = endTime - startTime;
        if (time < 3000) {
          return false
        }

        if (document.hidden) {
          return false
        }

        element.click();
        skipCount++;

        debug.log('youtube.com ad skip count', skipCount);
      };

      ready('.ytp-ad-skip-button', function (element) {
        skipHandler(element);
      });

      ready('.ytp-ad-skip-button-modern', function (element) {
        skipHandler(element);
      });

      setInterval(function () {
        const adSkipBtn = document.querySelector('.ytp-ad-skip-button');
        const adSkipBtnModern = document.querySelector('.ytp-ad-skip-button-modern');
        adSkipBtn && skipHandler(adSkipBtn);
        adSkipBtnModern && skipHandler(adSkipBtnModern);
      }, 1000);

      h5Player.hasBindSkipAdEvents = true;
    },
    webFullScreen: 'button.ytp-size-button',
    fullScreen: 'button.ytp-fullscreen-button',
    next: '.ytp-next-button',
    afterPlay: function (h5Player, taskConf) {
      setTimeout(() => { h5Player.setCurrentTimeUp(0.01, true); }, 0);

      const player = h5Player.player();
      const playerwWrap = player.closest('.html5-video-player');

      if (!playerwWrap) {
        return
      }

      playerwWrap.classList.add('ytp-autohide', 'playing-mode');
      clearTimeout(playerwWrap.autohideTimer);
      playerwWrap.autohideTimer = setTimeout(() => {
        playerwWrap.classList.add('ytp-autohide', 'playing-mode');
      }, 1000);

      if (!playerwWrap.hasBindCustomEvents) {
        const mousemoveHander = (event) => {
          playerwWrap.classList.remove('ytp-autohide', 'ytp-hide-info-bar');

          clearTimeout(playerwWrap.mousemoveTimer);
          playerwWrap.mousemoveTimer = setTimeout(() => {
            if (!player.paused) {
              playerwWrap.classList.add('ytp-autohide', 'ytp-hide-info-bar');
            }
          }, 1000 * 2);
        };

        const clickHander = (event) => {
          h5Player.switchPlayStatus();
          mousemoveHander();
        };

        player.addEventListener('mousemove', mousemoveHander);
        player.addEventListener('click', clickHander);

        playerwWrap.hasBindCustomEvents = true;
      }

      const spinner = playerwWrap.querySelector('.ytp-spinner');

      if (spinner) {
        const hiddenSpinner = () => { spinner && (spinner.style.visibility = 'hidden'); };
        const visibleSpinner = () => { spinner && (spinner.style.visibility = 'visible'); };

        hiddenSpinner();

        clearTimeout(playerwWrap.spinnerTimer);
        playerwWrap.spinnerTimer = setTimeout(() => {
          spinner.style.display = 'none';
          visibleSpinner();
        }, 1000);
      }
    },
    afterPause: function (h5Player, taskConf) {
      const player = h5Player.player();
      const playerwWrap = player.closest('.html5-video-player');

      if (!playerwWrap) return

      playerwWrap.classList.remove('ytp-autohide', 'playing-mode');
      playerwWrap.classList.add('paused-mode');
      clearTimeout(playerwWrap.autohideTimer);
    },
    shortcuts: {
      register: [
        'escape'
      ],
      callback: function (h5Player, taskConf, data) {
        const { event } = data;
        if (event.keyCode === 27) {
          if (document.querySelector('.ytp-upnext').style.display !== 'none') {
            document.querySelector('.ytp-upnext-cancel-button').click();
          }
        }
      }
    }
  },
  'netflix.com': {
    // disable: true,
    fullScreen: 'button.button-nfplayerFullscreen',
    addCurrentTime: 'button.button-nfplayerFastForward',
    subtractCurrentTime: 'button.button-nfplayerBackTen',
    /**
     * https://github.com/xxxily/h5player/issues/234
     * https://github.com/xxxily/h5player/issues/317
     * https://github.com/xxxily/h5player/issues/381
     * https://github.com/xxxily/h5player/issues/179
     * https://github.com/xxxily/h5player/issues/147
     */
    playbackRate: true,
    shortcuts: {
      /**
       * TODO
       */
      register: [
        'f'
      ],
      callback: function (h5Player, taskConf, data) {
        return true
      }
    }
  },
  'bilibili.com': {
    fullScreen: function () {
      const fullScreen = $q('.bpx-player-ctrl-full') || $q('.squirtle-video-fullscreen') || $q('.bilibili-player-video-btn-fullscreen');
      if (fullScreen) {
        fullScreen.click();
        return true
      }
    },
    webFullScreen: function () {
      const oldWebFullscreen = $q('.bilibili-player-video-web-fullscreen');
      const webFullscreenEnter = $q('.bpx-player-ctrl-web-enter') || $q('.squirtle-pagefullscreen-inactive');
      const webFullscreenLeave = $q('.bpx-player-ctrl-web-leave') || $q('.squirtle-pagefullscreen-active');
      if (oldWebFullscreen || (webFullscreenEnter && webFullscreenLeave)) {
        const webFullscreen = oldWebFullscreen || (getComputedStyle(webFullscreenLeave).display === 'none' ? webFullscreenEnter : webFullscreenLeave);
        webFullscreen.click();

        setTimeout(function () {
          const danmaku = $q('.bpx-player-dm-input') || $q('.bilibili-player-video-danmaku-input');
          danmaku && danmaku.blur();
        }, 1000 * 0.1);

        return true
      }
    },
    autoPlay: ['.bpx-player-ctrl-play', '.squirtle-video-start', '.bilibili-player-video-btn-start'],
    switchPlayStatus: ['.bpx-player-ctrl-play', '.squirtle-video-start', '.bilibili-player-video-btn-start'],
    next: ['.bpx-player-ctrl-next', '.squirtle-video-next', '.bilibili-player-video-btn-next', '.bpx-player-ctrl-btn[aria-label="下一个"]'],
    init: function (h5Player, taskConf) {},
    shortcuts: {
      register: [
        'escape'
      ],
      callback: function (h5Player, taskConf, data) {
        const { event } = data;
        if (event.keyCode === 27) {
          const oldWebFullscreen = $q('.bilibili-player-video-web-fullscreen');
          if (oldWebFullscreen && oldWebFullscreen.classList.contains('closed')) {
            oldWebFullscreen.click();
          } else {
            const webFullscreenLeave = $q('.bpx-player-ctrl-web-leave') || $q('.squirtle-pagefullscreen-active');
            if (getComputedStyle(webFullscreenLeave).display !== 'none') {
              webFullscreenLeave.click();
            }
          }
        }
      }
    }
  },
  't.bilibili.com': {
    fullScreen: 'button[name="fullscreen-button"]'
  },
  'live.bilibili.com': {
    init: function () {
      if (!JSON._stringifySource_) {
        JSON._stringifySource_ = JSON.stringify;

        JSON.stringify = function (arg1) {
          try {
            return JSON._stringifySource_.apply(this, arguments)
          } catch (e) {
            console.error('JSON.stringify ', e, arg1);
          }
        };
      }
    },
    fullScreen: '.bilibili-live-player-video-controller-fullscreen-btn button',
    webFullScreen: '.bilibili-live-player-video-controller-web-fullscreen-btn button',
    switchPlayStatus: '.bilibili-live-player-video-controller-start-btn button'
  },
  'acfun.cn': {
    fullScreen: '[data-bind-key="screenTip"]',
    webFullScreen: '[data-bind-key="webTip"]',
    switchPlayStatus: function (h5player) {
      const player = h5player.player();
      const status = player.paused;
      setTimeout(function () {
        if (status === player.paused) {
          if (player.paused) {
            player.play();
          } else {
            player.pause();
          }
        }
      }, 200);
    }
  },
  'ixigua.com': {
    fullScreen: ['xg-fullscreen.xgplayer-fullscreen', '.xgplayer-control-item__entry[aria-label="全屏"]', '.xgplayer-control-item__entry[aria-label="退出全屏"]'],
    webFullScreen: ['xg-cssfullscreen.xgplayer-cssfullscreen', '.xgplayer-control-item__entry[aria-label="剧场模式"]', '.xgplayer-control-item__entry[aria-label="退出剧场模式"]']
  },
  'tv.sohu.com': {
    fullScreen: 'button[data-title="网页全屏"]',
    webFullScreen: 'button[data-title="全屏"]'
  },
  'iqiyi.com': {
    fullScreen: '.iqp-btn-fullscreen',
    webFullScreen: '.iqp-btn-webscreen',
    next: '.iqp-btn-next',
    init: function (h5Player, taskConf) {
      hideDom('.iqp-logo-box');
      window.GM_addStyle(`
          div[templatetype="common_pause"]{ display:none }
          .iqp-logo-box{ display:none !important }
      `);
    }
  },
  'youku.com': {
    fullScreen: '.control-fullscreen-icon',
    next: '.control-next-video',
    init: function (h5Player, taskConf) {
      hideDom('.youku-layer-logo');
    }
  },
  'ted.com': {
    fullScreen: 'button.Fullscreen'
  },
  'qq.com': {
    pause: '.container_inner .txp-shadow-mod',
    play: '.container_inner .txp-shadow-mod',
    shortcuts: {
      register: ['c', 'x', 'z', '1', '2', '3', '4'],
      callback: function (h5Player, taskConf, data) {
        const { event } = data;
        const key = event.key.toLowerCase();
        const keyName = 'customShortcuts_' + key;

        if (!h5Player[keyName]) {
          h5Player[keyName] = {
            time: Date.now(),
            playbackRate: h5Player.playbackRate
          };
          return false
        } else {
          if (Date.now() - h5Player[keyName].time < 200) {
            return false
          }

          if (h5Player[keyName] === h5Player.playbackRate || h5Player[keyName] === true) {
            if (window.sessionStorage.playbackRate && /(c|x|z|1|2|3|4)/.test(key)) {
              const curSpeed = Number(window.sessionStorage.playbackRate);
              const perSpeed = curSpeed - 0.1 >= 0 ? curSpeed - 0.1 : 0.1;
              const nextSpeed = curSpeed + 0.1 <= 4 ? curSpeed + 0.1 : 4;
              let targetSpeed = curSpeed;
              switch (key) {
                case 'z' :
                  targetSpeed = 1;
                  break
                case 'c' :
                  targetSpeed = nextSpeed;
                  break
                case 'x' :
                  targetSpeed = perSpeed;
                  break
                default :
                  targetSpeed = Number(key);
                  break
              }

              window.sessionStorage.playbackRate = targetSpeed;
              h5Player.setCurrentTimeUp(0.01, true);
              h5Player.setPlaybackRate(targetSpeed, true);
              return true
            }

            h5Player[keyName] = true;
          } else {
            h5Player[keyName] = false;
          }
        }
      }
    },
    fullScreen: 'txpdiv[data-report="window-fullscreen"]',
    webFullScreen: 'txpdiv[data-report="browser-fullscreen"]',
    next: 'txpdiv[data-report="play-next"]',
    init: function (h5Player, taskConf) {
      hideDom('.txp-watermark');
      hideDom('.txp-watermark-action');
    },
    include: /(v.qq|sports.qq)/
  },
  'pan.baidu.com': {
    fullScreen: function (h5Player, taskConf) {
      h5Player.player().parentNode.querySelector('.vjs-fullscreen-control').click();
    }
  },
  // 'pornhub.com': {
  //   fullScreen: 'div[class*="icon-fullscreen"]',
  //   webFullScreen: 'div[class*="icon-size-large"]'
  // },
  'facebook.com': {
    fullScreen: function (h5Player, taskConf) {
      const actionBtn = h5Player.player().parentNode.querySelectorAll('button');
      if (actionBtn && actionBtn.length > 3) {
        actionBtn[actionBtn.length - 2].click();
        return true
      }
    },
    webFullScreen: function (h5Player, taskConf) {
      const actionBtn = h5Player.player().parentNode.querySelectorAll('button');
      if (actionBtn && actionBtn.length > 3) {
        actionBtn[actionBtn.length - 2].click();
        return true
      }
    },
    shortcuts: {
      register: [
        'escape'
      ],
      callback: function (h5Player, taskConf, data) {
        eachParentNode(h5Player.player(), function (parentNode) {
          if (parentNode.getAttribute('data-fullscreen-container') === 'true') {
            const goBackBtn = parentNode.parentNode.querySelector('div>a>i>u');
            if (goBackBtn) {
              goBackBtn.parentNode.parentNode.click();
            }
            return true
          }
        });
      }
    }
  },
  'douyu.com': {
    fullScreen: function (h5Player, taskConf) {
      const player = h5Player.player();
      const container = player._fullScreen_.getContainer();
      if (player._isFullScreen_) {
        container.querySelector('div[title="退出窗口全屏"]').click();
      } else {
        container.querySelector('div[title="窗口全屏"]').click();
      }
      player._isFullScreen_ = !player._isFullScreen_;
      return true
    },
    webFullScreen: function (h5Player, taskConf) {
      const player = h5Player.player();
      const container = player._fullScreen_.getContainer();
      if (player._isWebFullScreen_) {
        container.querySelector('div[title="退出网页全屏"]').click();
      } else {
        container.querySelector('div[title="网页全屏"]').click();
      }
      player._isWebFullScreen_ = !player._isWebFullScreen_;
      return true
    }
  },
  'open.163.com': {
    init: function (h5Player, taskConf) {
      const player = h5Player.player();
      /**
       * https://developer.mozilla.org/zh-CN/docs/Web/HTML/CORS_enabled_image
       * https://developer.mozilla.org/zh-CN/docs/Web/HTML/CORS_settings_attributes
       */
      player.setAttribute('crossOrigin', 'anonymous');
    }
  },
  'agefans.tv': {
    init: function (h5Player, taskConf) {
      h5Player.player().setAttribute('crossOrigin', 'anonymous');
    }
  },
  'chaoxing.com': {
    fullScreen: '.vjs-fullscreen-control'
  },
  'yixi.tv': {
    init: function (h5Player, taskConf) {
      h5Player.player().setAttribute('crossOrigin', 'anonymous');
    }
  },
  'douyin.com': {
    fullScreen: '.xgplayer-fullscreen',
    webFullScreen: '.xgplayer-page-full-screen',
    next: ['.xgplayer-playswitch-next'],
    init: function (h5Player, taskConf) {
      h5Player.player().setAttribute('crossOrigin', 'anonymous');

      const player = h5Player.player();
      const wrapEl = player.closest('div[data-e2e="feed-item"]');

      const setVideoTitle = () => {
        if (wrapEl && wrapEl.querySelector('.video-info-detail')) {
          const videoInfo = wrapEl.querySelector('.video-info-detail');
          const accountNameEL = videoInfo.querySelector('.account-name');
          const accountName = accountNameEL.innerText.replace(/^@*/, '');

          const titleEl = videoInfo.querySelector('.title');
          const titleText = titleEl.innerText.trim();
          const title = `${titleText} - ${accountName}`.replace(/[\\/:*?"<>|]/g, '-');

          wrapEl.setAttribute('data-title', title);
          player.setAttribute('data-title', title);
          document.title = title;
          wrapEl.removeEventListener('mouseover', setVideoTitle);
        }
      };

      wrapEl && wrapEl.addEventListener('mouseover', setVideoTitle);
      setTimeout(setVideoTitle, 1200);
    }
  },
  'live.douyin.com': {
    fullScreen: '.xgplayer-fullscreen',
    webFullScreen: '.xgplayer-page-full-screen',
    next: ['.xgplayer-playswitch-next'],
    init: function (h5Player, taskConf) {
      h5Player.player().setAttribute('crossOrigin', 'anonymous');
    }
  },
  'zhihu.com': {
    fullScreen: ['button[aria-label="全屏"]', 'button[aria-label="退出全屏"]'],
    play: function (h5Player, taskConf, data) {
      const player = h5Player.player();
      if (player && player.parentNode && player.parentNode.parentNode) {
        const maskWrap = player.parentNode.parentNode.querySelector('div~div:nth-child(3)');
        if (maskWrap) {
          const mask = maskWrap.querySelector('div');
          if (mask && mask.innerText === '') {
            mask.click();
          }
        }
      }
    },
    init: function (h5Player, taskConf) {
      h5Player.player().setAttribute('crossOrigin', 'anonymous');
    }
  },
  'weibo.com': {
    fullScreen: ['button.wbpv-fullscreen-control'],
    webFullScreen: ['div.wbpv-open-layer-button']
  },
  'twitter.com': {
    init: function (h5Player, taskConf) {
      const player = h5Player.player();
      const wrapEl = player.closest('article[data-testid="tweet"]');

      const setVideoTitle = () => {
        if (wrapEl && !wrapEl.getAttribute('data-title') && wrapEl.querySelector('div[data-testid="tweetText"]')) {
          const titleEl = wrapEl.querySelector('div[data-testid="tweetText"]');
          const titleText = titleEl.innerText.trim();
          const title = `${titleText}`.replace(/[\\/:*?"<>|]/g, '-');

          wrapEl.setAttribute('data-title', title);
          player.setAttribute('data-title', title);
          wrapEl.removeEventListener('mouseover', setVideoTitle);
        }
      };

      wrapEl && wrapEl.addEventListener('mouseover', setVideoTitle);
      setTimeout(setVideoTitle, 600);
    }
  }
};

function h5PlayerTccInit (h5Player) {
  return new TCC$1(taskConf, function (taskName, taskConf, data) {
    try {
      const task = taskConf[taskName];
      const wrapDom = h5Player.getPlayerWrapDom();

      if (!task) { return }

      if (taskName === 'shortcuts') {
        if (isObj$1(task) && task.callback instanceof Function) {
          return task.callback(h5Player, taskConf, data)
        }
      } else if (task instanceof Function) {
        try {
          return task(h5Player, taskConf, data)
        } catch (e) {
          debug.error('', taskName, taskConf, data, e);
          return false
        }
      } else if (typeof task === 'boolean') {
        return task
      } else {
        const selectorList = Array.isArray(task) ? task : [task];
        for (let i = 0; i < selectorList.length; i++) {
          const selector = selectorList[i];

          if (wrapDom && wrapDom.querySelector(selector)) {
            wrapDom.querySelector(selector).click();
            return true
          } else if (document.querySelector(selector)) {
            document.querySelector(selector).click();
            return true
          }
        }
      }
    } catch (e) {
      debug.error('', taskName, taskConf, data, e);
      return false
    }
  })
}

function mergeTaskConf (config) {
  return mergeObj(taskConf, config)
}

const fakeConfig = {
  // 'tv.cctv.com': userAgentMap.iPhone.chrome,
  // 'v.qq.com': userAgentMap.iPad.chrome,
  'open.163.com': userAgentMap.iPhone.chrome,
  'm.open.163.com': userAgentMap.iPhone.chrome,
  'pan.baidu.com': userAgentMap.iPhone.safari
};

function setFakeUA (ua) {
  const host = window.location.host;
  ua = ua || fakeConfig[host];

  /**
   * eg. open.163.com
   * */
  // let customUA = window.localStorage.getItem('_h5_player_user_agent_')
  // debug.log(customUA, window.location.href, window.navigator.userAgent, document.referrer)
  // if (customUA) {
  //   fakeUA(customUA)
  //   alert(customUA)
  // } else {
  //   alert('ua false')
  // }

  ua && fakeUA(ua);
}

/**
 */

class FullScreen {
  constructor (dom, pageMode) {
    this.dom = dom;
    this.shadowRoot = null;
    this.fullStatus = false;
    this.pageMode = pageMode || false;
    const fullPageStyle = `
      ._webfullscreen_box_size_ {
				width: 100% !important;
				height: 100% !important;
			}
      ._webfullscreen_ {
        display: block !important;
				position: fixed !important;
				width: 100% !important;
				height: 100% !important;
				top: 0 !important;
				left: 0 !important;
				background: #000 !important;
				z-index: 999999 !important;
			}
			._webfullscreen_zindex_ {
				z-index: 999999 !important;
			}
		`;
    if (!window._hasInitFullPageStyle_ && window.GM_addStyle) {
      window.GM_addStyle(fullPageStyle);
      window._hasInitFullPageStyle_ = true;
    }

    const shadowRoot = isInShadow(dom, true);
    if (shadowRoot) {
      this.shadowRoot = shadowRoot;
      loadCSSText(fullPageStyle, 'fullPageStyle', shadowRoot);
    }

    const t = this;
    window.addEventListener('keyup', (event) => {
      const key = event.key.toLowerCase();
      if (key === 'escape') {
        if (t.isFull()) {
          t.exit();
        } else if (t.isFullScreen()) {
          t.exitFullScreen();
        }
      }
    }, true);

    this.getContainer();
  }

  eachParentNode (dom, fn) {
    let parent = dom.parentNode;
    while (parent && parent.classList) {
      const isEnd = fn(parent, dom);
      parent = parent.parentNode;
      if (isEnd) {
        break
      }
    }
  }

  getContainer () {
    const t = this;
    if (t._container_) return t._container_

    const d = t.dom;
    const domBox = d.getBoundingClientRect();
    let container = d;
    t.eachParentNode(d, function (parentNode) {
      const noParentNode = !parentNode || !parentNode.getBoundingClientRect;
      if (noParentNode || parentNode.getAttribute('data-fullscreen-container')) {
        container = parentNode;
        return true
      }

      const parentBox = parentNode.getBoundingClientRect();
      const isInsideTheBox = parentBox.width <= domBox.width && parentBox.height <= domBox.height;
      if (isInsideTheBox) {
        container = parentNode;
      } else {
        return true
      }
    });

    container.setAttribute('data-fullscreen-container', 'true');
    t._container_ = container;
    return container
  }

  isFull () {
    return this.dom.classList.contains('_webfullscreen_') || this.fullStatus
  }

  isFullScreen () {
    const d = document;
    return !!(d.fullscreen || d.webkitIsFullScreen || d.mozFullScreen ||
      d.fullscreenElement || d.webkitFullscreenElement || d.mozFullScreenElement)
  }

  enterFullScreen () {
    const c = this.getContainer();
    const enterFn = c.requestFullscreen || c.webkitRequestFullScreen || c.mozRequestFullScreen || c.msRequestFullScreen;
    enterFn && enterFn.call(c);
  }

  enter () {
    const t = this;
    if (t.isFull()) return
    const container = t.getContainer();
    let needSetIndex = false;
    if (t.dom === container) {
      needSetIndex = true;
    }

    function addFullscreenStyleToParentNode (node) {
      t.eachParentNode(node, function (parentNode) {
        parentNode.classList.add('_webfullscreen_');
        if (container === parentNode || needSetIndex) {
          needSetIndex = true;
          parentNode.classList.add('_webfullscreen_zindex_');
        }
      });
    }
    addFullscreenStyleToParentNode(t.dom);

    if (t.dom.parentNode) {
      const domBox = t.dom.getBoundingClientRect();
      const domParentBox = t.dom.parentNode.getBoundingClientRect();
      if (domParentBox.width - domBox.width >= 5) {
        t.dom.classList.add('_webfullscreen_');
      }

      if (t.shadowRoot && t.shadowRoot._shadowHost) {
        const shadowHost = t.shadowRoot._shadowHost;
        const shadowHostBox = shadowHost.getBoundingClientRect();
        if (shadowHostBox.width <= domBox.width) {
          shadowHost.classList.add('_webfullscreen_');
          addFullscreenStyleToParentNode(shadowHost);
        }
      }
    }

    const fullScreenMode = !t.pageMode;
    if (fullScreenMode) {
      t.enterFullScreen();
    }

    this.fullStatus = true;
  }

  exitFullScreen () {
    const d = document;
    const exitFn = d.exitFullscreen || d.webkitExitFullscreen || d.mozCancelFullScreen || d.msExitFullscreen;
    exitFn && exitFn.call(d);
  }

  exit () {
    const t = this;

    function removeFullscreenStyleToParentNode (node) {
      t.eachParentNode(node, function (parentNode) {
        parentNode.classList.remove('_webfullscreen_');
        parentNode.classList.remove('_webfullscreen_zindex_');
      });
    }
    removeFullscreenStyleToParentNode(t.dom);

    t.dom.classList.remove('_webfullscreen_');

    if (t.shadowRoot && t.shadowRoot._shadowHost) {
      const shadowHost = t.shadowRoot._shadowHost;
      shadowHost.classList.remove('_webfullscreen_');
      removeFullscreenStyleToParentNode(shadowHost);
    }

    const fullScreenMode = !t.pageMode;
    if (fullScreenMode || t.isFullScreen()) {
      t.exitFullScreen();
    }
    this.fullStatus = false;
  }

  toggle () {
    this.isFull() ? this.exit() : this.enter();
  }
}

/*!
 * @name      videoCapturer.js
 * @version   0.0.1
 * @author    Blaze
 * @date      2019/9/21 12:03
 * @github    https://github.com/xxxily
 */

async function setClipboard (blob) {
  if (navigator.clipboard) {
    navigator.clipboard.write([
      // eslint-disable-next-line no-undef
      new ClipboardItem({
        [blob.type]: blob
      })
    ]).then(() => {
      console.info('[setClipboard] clipboard suc', blob.type);
    }).catch((e) => {
      console.error('[setClipboard] clipboard err', blob.type, e);
    });
  } else {
    console.error('\n https://developer.mozilla.org/en-US/docs/Web/API/Clipboard');
  }
}

var videoCapturer = {
  /**
   * @returns {boolean}
   */
  capture (video, download, title) {
    if (!video) return false
    const t = this;
    const currentTime = `${Math.floor(video.currentTime / 60)}'${(video.currentTime % 60).toFixed(3)}''`;
    const captureTitle = title || `${document.title}_${currentTime}`;

    video.setAttribute('crossorigin', 'anonymous');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (download) {
      t.download(canvas, captureTitle, video);
    } else {
      t.previe(canvas, captureTitle);
    }

    return canvas
  },
  /**
   * @param canvas
   */
  previe (canvas, title) {
    canvas.style = 'max-width:100%';
    const previewPage = window.open('', '_blank');
    previewPage.document.title = `capture previe - ${title || 'Untitled'}`;
    previewPage.document.body.style.textAlign = 'center';
    previewPage.document.body.style.background = '#000';
    previewPage.document.body.appendChild(canvas);
  },
  /**
   * @param canvas
   */
  download (canvas, title, video) {
    title = title || 'videoCapturer_' + Date.now();

    try {
      /**
       */
      canvas.toBlob(function (blob) {
        setClipboard(blob);
      }, 'image/png', 0.99);
    } catch (e) {
      console.error('', e);
    }

    try {
      canvas.toBlob(function (blob) {
        const el = document.createElement('a');
        el.download = `${title}.jpg`;
        el.href = URL.createObjectURL(blob);
        el.click();
      }, 'image/jpeg', 0.99);
    } catch (e) {
      videoCapturer.previe(canvas, title);
      console.error('CORS\n https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS');
      console.error(video, e);
    }
  }
};

/**
 */

class MouseObserver {
  constructor (observeOpt) {
    // eslint-disable-next-line no-undef
    this.observer = new IntersectionObserver((infoList) => {
      infoList.forEach((info) => {
        info.target.IntersectionObserverEntry = info;
      });
    }, observeOpt || {});

    this.observeList = [];
  }

  _observe (target) {
    let hasObserve = false;
    for (let i = 0; i < this.observeList.length; i++) {
      const el = this.observeList[i];
      if (target === el) {
        hasObserve = true;
        break
      }
    }

    if (!hasObserve) {
      this.observer.observe(target);
      this.observeList.push(target);
    }
  }

  _unobserve (target) {
    this.observer.unobserve(target);
    const newObserveList = [];
    this.observeList.forEach((el) => {
      if (el !== target) {
        newObserveList.push(el);
      }
    });
    this.observeList = newObserveList;
  }

  /**
   */
  on (target, type, listener, options) {
    const t = this;
    t._observe(target);

    if (!target.MouseObserverEvent) {
      target.MouseObserverEvent = {};
    }
    target.MouseObserverEvent[type] = true;

    if (!t._mouseObserver_) {
      t._mouseObserver_ = {};
    }

    if (!t._mouseObserver_[type]) {
      t._mouseObserver_[type] = [];

      window.addEventListener(type, (event) => {
        t.observeList.forEach((target) => {
          const isVisibility = target.IntersectionObserverEntry && target.IntersectionObserverEntry.intersectionRatio > 0;
          const isReg = target.MouseObserverEvent[event.type] === true;
          if (isVisibility && isReg) {
            const bound = target.getBoundingClientRect();
            const offsetX = event.x - bound.x;
            const offsetY = event.y - bound.y;
            const isNeedTap = offsetX <= bound.width && offsetX >= 0 && offsetY <= bound.height && offsetY >= 0;

            if (isNeedTap) {
              const listenerList = t._mouseObserver_[type];
              listenerList.forEach((listener) => {
                if (listener instanceof Function) {
                  listener.call(t, event, {
                    x: offsetX,
                    y: offsetY
                  }, target);
                }
              });
            }
          }
        });
      }, options);
    }

    if (listener instanceof Function) {
      t._mouseObserver_[type].push(listener);
    }
  }

  /**
   * @returns {boolean}
   */
  off (target, type, listener) {
    const t = this;
    if (!target || !type || !listener || !t._mouseObserver_ || !t._mouseObserver_[type] || !target.MouseObserverEvent || !target.MouseObserverEvent[type]) return false

    const newListenerList = [];
    const listenerList = t._mouseObserver_[type];
    let isMatch = false;
    listenerList.forEach((listenerItem) => {
      if (listenerItem === listener) {
        isMatch = true;
      } else {
        newListenerList.push(listenerItem);
      }
    });

    if (isMatch) {
      t._mouseObserver_[type] = newListenerList;

      if (newListenerList.length === 0) {
        delete target.MouseObserverEvent[type];
      }

      if (JSON.stringify(target.MouseObserverEvent[type]) === '{}') {
        t._unobserve(target);
      }
    }
  }
}

/**
 */

class I18n {
  constructor (config) {
    this._languages = {};
    this._locale = this.getClientLang();
    this._defaultLanguage = '';
    this.init(config);
  }

  init (config) {
    if (!config) return false

    const t = this;
    t._locale = config.locale || t._locale;
    t._languages = config.languages || t._languages;
    t._defaultLanguage = config.defaultLanguage || t._defaultLanguage;
  }

  use () {}

  t (path) {
    const t = this;
    let result = t.getValByPath(t._languages[t._locale] || {}, path);

    if (!result && t._locale !== t._defaultLanguage) {
      result = t.getValByPath(t._languages[t._defaultLanguage] || {}, path);
    }

    return result || ''
  }

  language () {
    return this._locale
  }

  languages () {
    return this._languages
  }

  changeLanguage (locale) {
    if (this._languages[locale]) {
      this._locale = locale;
      return locale
    } else {
      return false
    }
  }

  /**
   */
  isMatchCurLang (lang) {
    const curLang = this.language() || '';

    const curLang2 = curLang.replace('-', '');
    const curLang3 = curLang.replace('-', '_');
    const curLang4 = curLang.split('-')[0];

    if (lang && !Array.isArray(lang)) { lang = [lang]; }
    return lang.includes(curLang) || lang.includes(curLang2) || lang.includes(curLang3) || lang.includes(curLang4)
  }

  /**
   * @returns {*}
   */
  getValByPath (obj, path) {
    path = path || '';
    const pathArr = path.split('.');
    let result = obj;

    for (let i = 0; i < pathArr.length; i++) {
      if (!result) break
      result = result[pathArr[i]];
    }

    return result
  }

  getClientLang () {
    return navigator.languages ? navigator.languages[0] : navigator.language
  }
}


var enUS = {
  website: '🏠Script Homepage',
  about: 'About',
  issues: 'Issues',
  faq: 'FAQ',
  setting: 'Setting',
  hotkeys: 'Hotkeys',
  keyboardControl: 'Keyboard Control',
  mouseControl: 'Mouse Control',
  hotkeysDocs: 'Hotkeys Docs',
  enable: 'Enable',
  disable: 'Disable',
  toggleStates: 'Enable/Disable',
  disableHotkeysTemporarily: 'Disable hotkeys temporarily',
  toggleHotkeysTemporarily: 'Toggle hotkeys temporarily',
  enableHotkeys: 'Enable hotkeys',
  disableHotkeys: 'Disable hotkeys',
  donate: '👍Donate',
  aboutDonate: 'How much the author has received?',
  aiProjects: '4000+ AI Open Source Projects',
  aboutAuthor: 'About the author',
  enableScript: 'Enable script',
  disableScript: 'Disable script',
  disableCurrentInstanceGUI: 'Close the current graphical user interface',
  disableGUITemporarily: 'Temporarily disable the graphical interface',
  enableGUI: 'Enable Graphical User Interface',
  disableGUI: 'Disable Graphical User Interface',
  graphicalInterface: 'Graphical Interface',
  alwaysShowGraphicalInterface: 'Always show graphical interface',
  openCrossOriginFramePage: 'Open cross-domain pages alone',
  disableInitAutoPlay: 'Prohibit autoplay of videos on this site',
  enableInitAutoPlay: 'Allow autoplay videos on this site',
  restoreConfiguration: 'Restore the global default configuration',
  blockSetPlaybackRate: 'Disable default speed regulation logic',
  blockSetCurrentTime: 'Disable default playback progress control logic',
  blockSetVolume: 'Disable default volume control logic',
  unblockSetPlaybackRate: 'Allow default speed adjustment logic',
  unblockSetCurrentTime: 'Allow default playback progress control logic',
  unblockSetVolume: 'Allow default volume control logic',
  allowAcousticGain: 'Turn on volume boost',
  notAllowAcousticGain: 'Disable volume boost ability',
  allowCrossOriginControl: 'Enable cross-domain control capability',
  notAllowCrossOriginControl: 'Disable cross-domain control capabilities',
  allowExperimentFeatures: 'Turn on experimental features',
  notAllowExperimentFeatures: 'Disable experimental features',
  experimentFeaturesWarning: 'Experimental features are likely to cause some uncertain problems, please turn on with caution',
  useMediaDownloadTips: 'To use the download capability, you need to enable experimental features.\nExperimental features can easily cause some uncertain problems. Are you sure you want to enable it?',
  allowExternalCustomConfiguration: 'Enable external customization capabilities',
  notAllowExternalCustomConfiguration: 'Turn off external customization capabilities',
  changeLog: 'Change log',
  currentVersion: 'Current version',
  checkVersion: 'Check for new version ?',
  configFail: 'Configuration failed',
  globalSetting: 'Global Settings',
  openCustomConfigurationEditor: 'Open custom configuration editor',
  localSetting: 'For this site only',
  openDebugMode: 'Enable debug mode',
  closeDebugMode: 'Turn off debug mode',
  unfoldMenu: 'Expand menu',
  foldMenu: 'Collapse menu',
  addGroupChat: '💬Add chat group',
  speed: 'Speed',
  capture: 'Capture',
  download: 'Download',
  mediaDownload: {
    enable: 'Enable media download',
    disable: 'Disable media download',
    downloadOptions: 'Download options',
    downloading: 'The file is being downloaded. Are you sure you want to execute this operation again?',
    hasDownload: 'The file has been downloaded. Are you sure you want to execute this operation again?',
    confirmTitle: 'Please enter the file name',
    notSupport: 'The current media file cannot be downloaded. The download function needs to be optimized and improved',
    notEndOfStream: 'The media data is not fully ready, are you sure you want to download it?',
    cancelAutoDownload: 'Cancel automatic download?',
    autoDownload: 'The media data is not fully ready, do you want to automatically download it when it is ready?',
    notFoundMediaSource: 'The corresponding media stream data was not found, the data may have been cleared or the media element has been removed, it is recommended to refresh the page and try again'
  },
  menu: 'Menu',
  more: 'More',
  moreActions: 'More actions',
  videoFilter: 'Video filter',
  resetFilterAndTransform: 'Reset filter and transform',
  brightnessUp: 'Increase brightness',
  brightnessDown: 'Decrease brightness',
  contrastUp: 'Increase contrast',
  contrastDown: 'Decrease contrast',
  saturationUp: 'Increase saturation',
  saturationDown: 'Decrease saturation',
  hueUp: 'Increase hue',
  hueDown: 'Decrease hue',
  blurUp: 'Increase blur',
  blurDown: 'Decrease blur',
  rotateAndMirror: 'Rotate and mirror',
  rotate90: 'Rotate 90 degrees',
  horizontalMirror: 'Horizontal mirror flip',
  verticalMirror: 'Vertical mirror flip',
  videoTransform: 'Video displacement',
  translateRight: 'Move the screen to the right',
  translateLeft: 'Move the screen to the left',
  translateUp: 'Move the screen up',
  translateDown: 'Move the screen down',
  languageSettings: 'Language settings',
  default: 'Default',
  autoChoose: 'Auto choose',
  comingSoon: 'More features are being improved, stay tuned',
  ffmpegScript: 'Audio and video merge/convert script',
  autoGotoBufferedTime: 'Automatically jump to the buffered time',
  disableAutoGotoBufferedTime: 'Disable automatic jump to the buffered time',
  mouse: {
    enable: 'Enable mouse control',
    disable: 'Disable mouse control',
    longPressTime: 'How long to respond to mouse long press events'
  },
  tipsMsg: {
    playspeed: 'Speed: ',
    forward: 'Forward: ',
    backward: 'Backward: ',
    seconds: 'sec',
    volume: 'Volume: ',
    nextframe: 'Next frame',
    previousframe: 'Previous frame',
    stopframe: 'Stopframe: ',
    play: 'Play',
    pause: 'Pause',
    arpl: 'Allow auto resume playback progress',
    drpl: 'Disable auto resume playback progress',
    brightness: 'Brightness: ',
    contrast: 'Contrast: ',
    saturation: 'Saturation: ',
    hue: 'HUE: ',
    blur: 'Blur: ',
    imgattrreset: 'Attributes: reset',
    imgrotate: 'Picture rotation: ',
    onplugin: 'ON h5Player plugin',
    offplugin: 'OFF h5Player plugin',
    globalmode: 'Global mode: ',
    playbackrestored: 'Restored the last playback progress for you',
    playbackrestoreoff: 'The function of restoring the playback progress is disabled. Press SHIFT+R to turn on the function',
    horizontal: 'Horizontal displacement: ',
    vertical: 'Vertical displacement: ',
    horizontalMirror: 'Horizontal mirror',
    verticalMirror: 'vertical mirror',
    videozoom: 'Video zoom: '
  },
  demo: 'demo-test'
};

var ru = {
  website: '🏠официальный сайт скрипта',
  about: 'около',
  issues: 'обратная связь',
  faq: 'часто задаваемые вопросы',
  setting: 'установка',
  hotkeys: 'горячие клавиши',
  keyboardControl: 'управление клавиатурой',
  mouseControl: 'управление мышью',
  hotkeysDocs: 'документы горячих клавиш',
  enable: 'включить',
  disable: 'отключить',
  toggleStates: 'включить/отключить',
  disableHotkeysTemporarily: 'временно отключить горячие клавиши',
  toggleHotkeysTemporarily: 'временно включить/отключить горячие клавиши',
  enableHotkeys: 'включить горячие клавиши',
  disableHotkeys: 'отключить горячие клавиши',
  donate: '👍пожертвовать',
  aboutDonate: 'Сколько автор получил?',
  aiProjects: '4000+ AI-проектов с открытым исходным кодом',
  aboutAuthor: 'о авторе',
  enableScript: 'включить скрипт',
  disableScript: 'отключить скрипт',
  disableCurrentInstanceGUI: 'отключить текущий графический интерфейс пользователя',
  disableGUITemporarily: 'Временно отключить графический интерфейс пользователя',
  enableGUI: 'Включить графический интерфейс пользователя',
  disableGUI: 'Отключить графический интерфейс пользователя',
  graphicalInterface: 'Графический интерфейс',
  alwaysShowGraphicalInterface: 'Всегда показывать графический интерфейс',
  openCrossOriginFramePage: 'Открывать только междоменные страницы',
  disableInitAutoPlay: 'Запретить автовоспроизведение видео на этом сайте',
  enableInitAutoPlay: 'Разрешить автоматическое воспроизведение видео на этом сайте',
  restoreConfiguration: 'Восстановить глобальную конфигурацию по умолчанию',
  blockSetPlaybackRate: 'Отключить логику регулирования скорости по умолчанию',
  blockSetCurrentTime: 'Отключить логику управления ходом воспроизведения по умолчанию',
  blockSetVolume: 'Отключить логику управления громкостью по умолчанию',
  unblockSetPlaybackRate: 'Разрешить логику регулировки скорости по умолчанию',
  unblockSetCurrentTime: 'Разрешить логику управления ходом воспроизведения по умолчанию',
  unblockSetVolume: 'Разрешить логику управления громкостью по умолчанию',
  allowAcousticGain: 'Включите усиление громкости',
  notAllowAcousticGain: 'Отключить возможность увеличения громкости',
  allowCrossOriginControl: 'Включить возможность междоменного контроля',
  notAllowCrossOriginControl: 'Отключить возможности междоменного контроля',
  allowExperimentFeatures: 'Включить экспериментальные функции',
  notAllowExperimentFeatures: 'Отключить экспериментальные функции',
  experimentFeaturesWarning: 'Экспериментальные функции могут вызвать определенные проблемы, включайте их с осторожностью.',
  useMediaDownloadTips: 'Чтобы использовать функцию загрузки, вам необходимо включить экспериментальную функцию.\nЭкспериментальные функции могут легко вызвать некоторые неопределенные проблемы. Вы уверены, что хотите включить ее?',
  allowExternalCustomConfiguration: 'Включить возможности внешней настройки',
  notAllowExternalCustomConfiguration: 'Отключить возможности внешней настройки',
  changeLog: 'Журнал изменений',
  currentVersion: 'Текущая версия',
  checkVersion: 'Проверить наличие новой версии ?',
  configFail: 'Ошибка конфигурации',
  globalSetting: 'Глобальные настройки',
  openCustomConfigurationEditor: 'Открыть редактор пользовательской конфигурации',
  localSetting: 'только для этого сайта',
  openDebugMode: 'Включить режим отладки',
  closeDebugMode: 'отключить режим отладки',
  unfoldMenu: 'развернуть меню',
  foldMenu: 'свернуть меню',
  addGroupChat: '💬Добавить группу чата',
  speed: 'Скорость',
  capture: 'Захват',
  download: 'Скачать',
  mediaDownload: {
    enable: 'Включить загрузку медиафайлов',
    disable: 'Отключить загрузку медиафайлов',
    downloadOptions: 'Опции загрузки',
    downloading: 'Идет скачивание файла. Вы уверены, что хотите повторить эту операцию?',
    hasDownload: 'Файл скачан. Вы уверены, что хотите повторить эту операцию?',
    confirmTitle: 'Пожалуйста, введите имя файла',
    notSupport: 'Текущий медиафайл невозможно загрузить, а функцию загрузки необходимо оптимизировать и улучшить.',
    notEndOfStream: 'Медиаданные еще не полностью готовы. Вы уверены, что хотите их скачать?',
    cancelAutoDownload: 'Отменить автоматическую загрузку?',
    autoDownload: 'Будут ли медиаданные загружаться автоматически после их полной готовности?',
    notFoundMediaSource: 'Соответствующие данные медиапотока не найдены. Возможно, данные были очищены или медиа-элементы удалены. Рекомендуется обновить страницу и повторить попытку.'
  },
  menu: 'Меню',
  more: 'Больше',
  moreActions: 'Дополнительные действия',
  videoFilter: 'Видеофильтр',
  resetFilterAndTransform: 'Сбросить фильтр и трансформацию',
  brightnessUp: 'Увеличить яркость',
  brightnessDown: 'Уменьшить яркость',
  contrastUp: 'Увеличить контраст',
  contrastDown: 'Уменьшить контраст',
  saturationUp: 'Увеличить насыщенность',
  saturationDown: 'Уменьшить насыщенность',
  hueUp: 'Увеличить оттенок',
  hueDown: 'Уменьшить оттенок',
  blurUp: 'Увеличить размытие',
  blurDown: 'Уменьшить размытие',
  rotateAndMirror: 'Повернуть и отразить',
  rotate90: 'Повернуть изображение на 90 градусов',
  horizontalMirror: 'Горизонтальное отражение изображения',
  verticalMirror: 'Вертикальное отражение изображения',
  videoTransform: 'Видео трансформация',
  translateRight: 'Сдвинуть экран вправо',
  translateLeft: 'Сдвинуть экран влево',
  translateUp: 'Сдвинуть экран вверх',
  translateDown: 'Сдвинуть экран вниз',
  languageSettings: 'Настройки языка',
  default: 'По умолчанию',
  autoChoose: 'Автоматический выбор',
  comingSoon: 'Больше функций находится в процессе улучшения, следите за обновлениями',
  ffmpegScript: 'Скрипт слияния/преобразования аудио и видео',
  autoGotoBufferedTime: 'Автоматически перейти к времени буфера',
  disableAutoGotoBufferedTime: 'Отключить автоматический переход к времени буфера',
  mouse: {
    enable: 'Включить управление мышью',
    disable: 'Отключить управление мышью',
    longPressTime: 'Как долго реагировать на долгие нажатия мыши'
  },
  tipsMsg: {
    playspeed: 'Скорость: ',
    forward: 'Вперёд: ',
    backward: 'Назад: ',
    seconds: ' сек',
    volume: 'Громкость: ',
    nextframe: 'Следующий кадр',
    previousframe: 'Предыдущий кадр',
    stopframe: 'Стоп-кадр: ',
    play: 'Запуск',
    pause: 'Пауза',
    arpl: 'Разрешить автоматическое возобновление прогресса воспроизведения',
    drpl: 'Запретить автоматическое возобновление прогресса воспроизведения',
    brightness: 'Яркость: ',
    contrast: 'Контраст: ',
    saturation: 'Насыщенность: ',
    hue: 'Оттенок: ',
    blur: 'Размытие: ',
    imgattrreset: 'Атрибуты: сброс',
    imgrotate: 'Поворот изображения: ',
    onplugin: 'ВКЛ: плагин воспроизведения',
    offplugin: 'ВЫКЛ: плагин воспроизведения',
    globalmode: 'Глобальный режим:',
    playbackrestored: 'Восстановлен последний прогресс воспроизведения',
    playbackrestoreoff: 'Функция восстановления прогресса воспроизведения отключена. Нажмите SHIFT + R, чтобы включить функцию',
    horizontal: 'Горизонтальное смещение: ',
    vertical: 'Вертикальное смещение: ',
    horizontalMirror: 'Горизонтальное зеркало',
    verticalMirror: 'вертикальное зеркало',
    videozoom: 'Увеличить видео: '
  }
};


const messages = {
  'en-US': enUS,
  en: enUS,
  ru
};

const i18n = new I18n({
  defaultLanguage: 'en',
  // locale: 'zh-TW',
  languages: messages
});

const lang = configManager.get('language');
lang && i18n.changeLanguage(lang);

let __globalId__ = 0;
function getId () {
  if (window.GM_getValue && window.GM_setValue) {
    let gID = window.GM_getValue('_global_id_');
    if (!gID) gID = 0;
    gID = Number(gID) + 1;
    window.GM_setValue('_global_id_', gID);
    return gID
  } else {
    __globalId__ = Number(__globalId__) + 1;
    return __globalId__
  }
}

let curTabId = null;

/**
 * @returns {Promise<any>}
 */
function getTabId () {
  return new Promise((resolve, reject) => {
    if (window.GM_getTab instanceof Function) {
      window.GM_getTab(function (obj) {
        if (!obj.tabId) {
          obj.tabId = getId();
          window.GM_saveTab(obj);
        }
        curTabId = obj.tabId;
        resolve(obj.tabId);
      });
    } else {
      resolve(Date.now());
    }
  })
}

getTabId();

/*!
 * @name      monkeyMsg.js
 * @version   0.0.1
 * @author    Blaze
 * @date      2019/9/21 14:22
 */
// import debug from './debug'

/**
 * @returns {{}}
 */
function extractDatafromOb (obj, deep) {
  deep = deep || 1;
  if (deep > 3) return {}

  const result = {};
  if (typeof obj === 'object') {
    for (const key in obj) {
      const val = obj[key];
      const valType = typeof val;
      if (valType === 'number' || valType === 'string' || valType === 'boolean') {
        Object.defineProperty(result, key, {
          value: val,
          writable: true,
          configurable: true,
          enumerable: true
        });
      } else if (valType === 'object' && Object.prototype.propertyIsEnumerable.call(obj, key)) {
        result[key] = extractDatafromOb(val, deep + 1);
      } else if (valType === 'array') {
        result[key] = val;
      } else ;
    }
  }
  return result
}

const monkeyMsg = {
  /**
   * @returns {Promise<void>}
   */
  send (name, data, throttleInterval = 80) {
    if (!window.GM_getValue || !window.GM_setValue) {
      return false
    }

    const oldMsg = window.GM_getValue(name);
    if (oldMsg && oldMsg.updateTime) {
      const interval = Math.abs(Date.now() - oldMsg.updateTime);
      if (interval < throttleInterval) {
        return false
      }
    }

    const msg = {
      data,
      tabId: curTabId || 'undefined',
      title: document.title,
      referrer: extractDatafromOb(window.location),
      updateTime: Date.now()
    };
    if (typeof data === 'object') {
      msg.data = extractDatafromOb(data);
    }
    window.GM_setValue(name, msg);

    // debug.info(`[monkeyMsg-send][${name}]`, msg)
  },
  set: (name, data) => monkeyMsg.send(name, data),
  get: (name) => window.GM_getValue && window.GM_getValue(name),
  on: (name, fn) => window.GM_addValueChangeListener && window.GM_addValueChangeListener(name, function (name, oldVal, newVal, remote) {
    // debug.info(`[monkeyMsg-on][${name}]`, oldVal, newVal, remote)

    newVal.originTab = newVal.tabId === curTabId;

    fn instanceof Function && fn.apply(null, arguments);
  }),
  off: (listenerId) => window.GM_removeValueChangeListener && window.GM_removeValueChangeListener(listenerId),

  /**
   * @returns
   */
  broadcast (handler) {
    const broadcastName = '__monkeyMsgBroadcast__';
    monkeyMsg._monkeyMsgBroadcastHandler_ = monkeyMsg._monkeyMsgBroadcastHandler_ || [];
    handler instanceof Function && monkeyMsg._monkeyMsgBroadcastHandler_.push(handler);

    if (monkeyMsg._hasMonkeyMsgBroadcast_) {
      return broadcastName
    }

    monkeyMsg.on(broadcastName, function () {
      monkeyMsg._monkeyMsgBroadcastHandler_.forEach(handler => {
        handler.apply(null, arguments);
      });
    });

    setInterval(function () {
      const data = monkeyMsg.get(broadcastName);
      if (data && Date.now() - data.updateTime < 1000 * 2) {
        return false
      }

      monkeyMsg.send(broadcastName, {});
    }, 1000 * 2);

    return broadcastName
  }
};

/*!
 * @name         crossTabCtl.js
 * @version      0.0.1
 * @author       Blaze
 * @github       https://github.com/xxxily
 */


const crossTabCtl = {
  excludeShortcuts (event) {
    if (!event || typeof event.keyCode === 'undefined') {
      return false
    }

    const excludeKeyCode = ['c', 'v', 'f', 'd'];

    if (event.ctrlKey || event.metaKey) {
      const key = event.key.toLowerCase();
      if (excludeKeyCode.includes(key)) {
        return true
      } else {
        return false
      }
    } else {
      return false
    }
  },
  updatePictureInPictureInfo () {
    setInterval(function () {
      if (document.pictureInPictureElement) {
        monkeyMsg.send('globalPictureInPictureInfo', {
          usePictureInPicture: true
        });
      }
    }, 1000 * 1.5);

    /**
     */
    monkeyMsg.broadcast(function () {
      // console.log('[monkeyMsg][broadcast]', ...arguments)
      if (document.pictureInPictureElement) {
        monkeyMsg.send('globalPictureInPictureInfo', {
          usePictureInPicture: true
        });
      }
    });
  },
  hasOpenPictureInPicture () {
    const data = monkeyMsg.get('globalPictureInPictureInfo');

    if (data && data.data) {
      if (data.data.usePictureInPicture) {
        return Math.abs(Date.now() - data.updateTime) < 1000 * 3
      } else {
        /**
         */
        return Math.abs(Date.now() - data.updateTime) < 1000 * 15
      }
    }

    return false
  },
  /**
   */
  isNeedSendCrossTabCtlEvent () {
    const t = crossTabCtl;

    const data = monkeyMsg.get('globalPictureInPictureInfo');
    if (t.hasOpenPictureInPicture() && data.tabId !== curTabId) {
      return true
    } else {
      return false
    }
  },
  crossTabKeydownEvent (event) {
    const t = crossTabCtl;
    const target = event.composedPath ? event.composedPath()[0] || event.target : event.target;
    if (isEditableTarget(target)) return
    if (t.isNeedSendCrossTabCtlEvent() && isRegisterKey(event) && !t.excludeShortcuts(event)) {
      event.stopPropagation();
      event.preventDefault();

      // monkeyMsg.send('globalKeydownEvent', event)

      return true
    }
  },
  bindCrossTabEvent () {
    const t = crossTabCtl;
    if (t._hasBindEvent_) return
    document.removeEventListener('keydown', t.crossTabKeydownEvent);
    document.addEventListener('keydown', t.crossTabKeydownEvent, true);
    t._hasBindEvent_ = true;
  },
  init () {
    const t = crossTabCtl;
    t.updatePictureInPictureInfo();
    t.bindCrossTabEvent();
  }
};

/*!
 * @name         index.js
 * @version      0.0.1
 * @author       Blaze
 * @date         2020/10/22 17:40
 * @github       https://github.com/xxxily
 */

const win = typeof window === 'undefined' ? global : window;
const toStr = Function.prototype.call.bind(Object.prototype.toString);
const toBoolean = Boolean.originMethod ? Boolean.originMethod : Boolean;
const util = {
  toStr,
  isObj: obj => toStr(obj) === '[object Object]',
  isRef: obj => typeof obj === 'object',
  isReg: obj => toStr(obj) === '[object RegExp]',
  isFn: obj => obj instanceof Function,
  isAsyncFn: fn => toStr(fn) === '[object AsyncFunction]',
  isPromise: obj => toStr(obj) === '[object Promise]',
  firstUpperCase: str => str.replace(/^\S/, s => s.toUpperCase()),
  toArr: arg => Array.from(Array.isArray(arg) ? arg : [arg]),

  debug: {
    log () {
      let log = win.console.log;
      if (log.originMethod) { log = log.originMethod; }
      if (win._debugMode_) {
        log.apply(win.console, arguments);
      }
    }
  },
  getAllKeys (obj) {
    const tmpArr = [];
    for (const key in obj) { tmpArr.push(key); }
    const allKeys = Array.from(new Set(tmpArr.concat(Reflect.ownKeys(obj))));
    return allKeys
  }
};

class HookJs {
  constructor (useProxy) {
    this.useProxy = useProxy || false;
    this.hookPropertiesKeyName = '_hookProperties' + Date.now();
  }

  hookJsPro () {
    return new HookJs(true)
  }

  _addHook (hookMethod, fn, type, classHook) {
    const hookKeyName = type + 'Hooks';
    const hookMethodProperties = hookMethod[this.hookPropertiesKeyName];
    if (!hookMethodProperties[hookKeyName]) {
      hookMethodProperties[hookKeyName] = [];
    }

    let hasSameHook = false;
    for (let i = 0; i < hookMethodProperties[hookKeyName].length; i++) {
      if (fn === hookMethodProperties[hookKeyName][i]) {
        hasSameHook = true;
        break
      }
    }

    if (!hasSameHook) {
      fn.classHook = classHook || false;
      hookMethodProperties[hookKeyName].push(fn);
    }
  }

  _runHooks (parentObj, methodName, originMethod, hookMethod, target, ctx, args, classHook, hookPropertiesKeyName) {
    const hookMethodProperties = hookMethod[hookPropertiesKeyName];
    const beforeHooks = hookMethodProperties.beforeHooks || [];
    const afterHooks = hookMethodProperties.afterHooks || [];
    const errorHooks = hookMethodProperties.errorHooks || [];
    const hangUpHooks = hookMethodProperties.hangUpHooks || [];
    const replaceHooks = hookMethodProperties.replaceHooks || [];
    const execInfo = {
      result: null,
      error: null,
      args,
      type: ''
    };

    function runHooks (hooks, type) {
      let hookResult = null;
      execInfo.type = type || '';
      if (Array.isArray(hooks)) {
        for (let i = 0; i < hooks.length; i++) {
          const fn = hooks[i];
          if (util.isFn(fn) && classHook === fn.classHook) {
            hookResult = fn(args, parentObj, methodName, originMethod, execInfo, ctx);
            if (hookResult === 'STOP-INVOKE') {
              return hookResult
            }
          }
        }
      }
      return hookResult
    }

    const runTarget = classHook
      ? function () { return new target(...args) }
      : function () { return target.apply(ctx, args) };

    const beforeHooksResult = runHooks(beforeHooks, 'before');
    if (beforeHooksResult === 'STOP-INVOKE') {
      return beforeHooksResult
    }

    if (hangUpHooks.length || replaceHooks.length) {
      /**
       */
      runHooks(hangUpHooks, 'hangUp');
      runHooks(replaceHooks, 'replace');
    } else {
      if (errorHooks.length) {
        try {
          execInfo.result = runTarget();
        } catch (err) {
          execInfo.error = err;
          const errorHooksResult = runHooks(errorHooks, 'error');
          if (errorHooksResult !== 'SKIP-ERROR') {
            throw err
          }
        }
      } else {
        execInfo.result = runTarget();
      }
    }

    /**
     * wenku.baidu.com
     * https://pubs.rsc.org/en/content/articlelanding/2021/sc/d1sc01881g#!divAbstract
     * https://www.elsevier.com/connect/coronavirus-information-center
     */
    // if (execInfo.result && execInfo.result.then && util.isPromise(execInfo.result)) {
    //   execInfo.result.then(function (data) {
    //     execInfo.result = data
    //     runHooks(afterHooks, 'after')
    //     return Promise.resolve.apply(ctx, arguments)
    //   }).catch(function (err) {
    //     execInfo.error = err
    //     runHooks(errorHooks, 'error')
    //     return Promise.reject.apply(ctx, arguments)
    //   })
    // }

    runHooks(afterHooks, 'after');

    return execInfo.result
  }

  _proxyMethodcGenerator (parentObj, methodName, originMethod, classHook, context, proxyHandler) {
    const t = this;
    const useProxy = t.useProxy;
    let hookMethod = null;

    if (t.isHook(originMethod)) {
      hookMethod = originMethod;
    } else if (originMethod[t.hookPropertiesKeyName] && t.isHook(originMethod[t.hookPropertiesKeyName].hookMethod)) {
      hookMethod = originMethod[t.hookPropertiesKeyName].hookMethod;
    }

    if (hookMethod) {
      if (!hookMethod[t.hookPropertiesKeyName].isHook) {
        hookMethod[t.hookPropertiesKeyName].isHook = true;
        util.debug.log(`[hook method] ${util.toStr(parentObj)} ${methodName}`);
      }
      return hookMethod
    }

    if (useProxy && Proxy) {
      const handler = { ...proxyHandler };

      if (classHook) {
        handler.construct = function (target, args, newTarget) {
          context = context || this;
          return t._runHooks(parentObj, methodName, originMethod, hookMethod, target, context, args, true, t.hookPropertiesKeyName)
        };
      } else {
        handler.apply = function (target, ctx, args) {
          ctx = context || ctx;
          return t._runHooks(parentObj, methodName, originMethod, hookMethod, target, ctx, args, false, t.hookPropertiesKeyName)
        };
      }

      hookMethod = new Proxy(originMethod, handler);
    } else {
      hookMethod = function () {
        /**
         */
        const ctx = context || this;
        return t._runHooks(parentObj, methodName, originMethod, hookMethod, originMethod, ctx, arguments, classHook, t.hookPropertiesKeyName)
      };

      const keys = Reflect.ownKeys(originMethod);
      keys.forEach(keyName => {
        try {
          Object.defineProperty(hookMethod, keyName, {
            get: function () {
              return originMethod[keyName]
            },
            set: function (val) {
              originMethod[keyName] = val;
            },
            configurable: true
          });
        } catch (err) {
          util.debug.log(`[proxyMethodcGenerator] hookMethod defineProperty abnormal.  hookMethod:${methodName}, definePropertyName:${keyName}`, err);
        }
      });
      hookMethod.prototype = originMethod.prototype;
    }

    const hookMethodProperties = hookMethod[t.hookPropertiesKeyName] = {};

    hookMethodProperties.originMethod = originMethod;
    hookMethodProperties.hookMethod = hookMethod;
    hookMethodProperties.isHook = true;
    hookMethodProperties.classHook = classHook;

    util.debug.log(`[hook method] ${util.toStr(parentObj)} ${methodName}`);

    return hookMethod
  }

  _getObjKeysByRule (obj, rule) {
    let excludeRule = null;
    let result = rule;

    if (util.isObj(rule) && rule.include) {
      excludeRule = rule.exclude;
      rule = rule.include;
      result = rule;
    }

    /**
     * https://es6.ruanyifeng.com/#docs/object#%E5%B1%9E%E6%80%A7%E7%9A%84%E9%81%8D%E5%8E%86
     */
    if (rule === '*') {
      result = Object.keys(obj);
    } else if (rule === '**') {
      result = Reflect.ownKeys(obj);
    } else if (rule === '***') {
      result = util.getAllKeys(obj);
    } else if (util.isReg(rule)) {
      result = util.getAllKeys(obj).filter(keyName => rule.test(keyName));
    }

    if (excludeRule) {
      result = Array.isArray(result) ? result : [result];
      if (util.isReg(excludeRule)) {
        result = result.filter(keyName => !excludeRule.test(keyName));
      } else if (Array.isArray(excludeRule)) {
        result = result.filter(keyName => !excludeRule.includes(keyName));
      } else {
        result = result.filter(keyName => excludeRule !== keyName);
      }
    }

    return util.toArr(result)
  }

  /**
   * @returns {boolean}
   */
  isHook (fn) {
    if (!fn || !fn[this.hookPropertiesKeyName]) {
      return false
    }
    const hookMethodProperties = fn[this.hookPropertiesKeyName];
    return util.isFn(hookMethodProperties.originMethod) && fn !== hookMethodProperties.originMethod
  }

  /**
   * @param parentObj
   * @param keyName
   * @returns {boolean}
   */
  isAllowHook (parentObj, keyName) {
    try { if (!parentObj[keyName]) return false } catch (e) { return false }
    const descriptor = Object.getOwnPropertyDescriptor(parentObj, keyName);
    return !(descriptor && descriptor.configurable === false)
  }

  /**
   * @returns {boolean}
   */
  hook (parentObj, hookMethods, fn, type, classHook, context, proxyHandler) {
    const opts = arguments[0];
    if (util.isObj(opts) && opts.parentObj && opts.hookMethods) {
      parentObj = opts.parentObj;
      hookMethods = opts.hookMethods;
      fn = opts.fn;
      type = opts.type;
      classHook = opts.classHook;
      context = opts.context;
      proxyHandler = opts.proxyHandler;
    }

    classHook = toBoolean(classHook);
    type = type || 'before';

    if ((!util.isRef(parentObj) && !util.isFn(parentObj)) || !util.isFn(fn) || !hookMethods) {
      return false
    }

    const t = this;

    hookMethods = t._getObjKeysByRule(parentObj, hookMethods);
    hookMethods.forEach(methodName => {
      if (!t.isAllowHook(parentObj, methodName)) {
        util.debug.log(`${util.toStr(parentObj)} [${methodName}] does not support modification`);
        return false
      }

      const descriptor = Object.getOwnPropertyDescriptor(parentObj, methodName);
      if (descriptor && descriptor.writable === false) {
        Object.defineProperty(parentObj, methodName, { writable: true });
      }

      const originMethod = parentObj[methodName];
      let hookMethod = null;

      if (!util.isFn(originMethod)) {
        return false
      }

      hookMethod = t._proxyMethodcGenerator(parentObj, methodName, originMethod, classHook, context, proxyHandler);

      const hookMethodProperties = hookMethod[t.hookPropertiesKeyName];
      if (hookMethodProperties.classHook !== classHook) {
        util.debug.log(`${util.toStr(parentObj)} [${methodName}] Cannot support functions hook and classes hook at the same time `);
        return false
      }

      if (parentObj[methodName] !== hookMethod) {
        parentObj[methodName] = hookMethod;
      }

      t._addHook(hookMethod, fn, type, classHook);
    });
  }

  hookClass (parentObj, hookMethods, fn, type, context, proxyHandler) {
    return this.hook(parentObj, hookMethods, fn, type, true, context, proxyHandler)
  }

  /**
   * @returns {boolean}
   */
  unHook (parentObj, hookMethods, type, fn) {
    if (!util.isRef(parentObj) || !hookMethods) {
      return false
    }

    const t = this;
    hookMethods = t._getObjKeysByRule(parentObj, hookMethods);
    hookMethods.forEach(methodName => {
      if (!t.isAllowHook(parentObj, methodName)) {
        return false
      }

      const hookMethod = parentObj[methodName];

      if (!t.isHook(hookMethod)) {
        return false
      }

      const hookMethodProperties = hookMethod[t.hookPropertiesKeyName];
      const originMethod = hookMethodProperties.originMethod;

      if (type) {
        const hookKeyName = type + 'Hooks';
        const hooks = hookMethodProperties[hookKeyName] || [];

        if (fn) {
          for (let i = 0; i < hooks.length; i++) {
            if (fn === hooks[i]) {
              delete fn.classHook;
              hookMethodProperties[hookKeyName].splice(i, 1);
              util.debug.log(`[unHook ${hookKeyName} func] ${util.toStr(parentObj)} ${methodName}`, fn);
              break
            }
          }

          const hasHooks = ['beforeHooks', 'afterHooks', 'errorHooks', 'hangUpHooks', 'replaceHooks'].some(key => {
            return Array.isArray(hookMethodProperties[key]) && hookMethodProperties[key].length > 0
          });

          if (!hasHooks) {
            parentObj[methodName] = originMethod;
            delete parentObj[methodName][t.hookPropertiesKeyName];
          }
        } else {
          if (Array.isArray(hookMethodProperties[hookKeyName])) {
            hookMethodProperties[hookKeyName].forEach(hook => {
              delete hook.classHook;
            });
            hookMethodProperties[hookKeyName] = [];
            util.debug.log(`[unHook all ${hookKeyName}] ${util.toStr(parentObj)} ${methodName}`);
          }
        }
      } else {
        if (util.isFn(originMethod)) {
          ['beforeHooks', 'afterHooks', 'errorHooks', 'hangUpHooks', 'replaceHooks'].forEach(key => {
            if (Array.isArray(hookMethodProperties[key])) {
              hookMethodProperties[key].forEach(hook => {
                delete hook.classHook;
              });
              hookMethodProperties[key] = [];
            }
          });

          parentObj[methodName] = originMethod;
          delete parentObj[methodName][t.hookPropertiesKeyName];

          // Object.keys(hookMethod).forEach(keyName => {
          //   if (/Hooks$/.test(keyName) && Array.isArray(hookMethod[keyName])) {
          //     hookMethod[keyName] = []
          //   }
          // })
          //
          // hookMethod.isHook = false
          // parentObj[methodName] = originMethod
          // delete parentObj[methodName].originMethod
          // delete parentObj[methodName].hookMethod
          // delete parentObj[methodName].isHook
          // delete parentObj[methodName].isClassHook

          util.debug.log(`[unHook method] ${util.toStr(parentObj)} ${methodName}`);
        }
      }
    });
  }

  _hook (args, type) {
    const t = this;
    return function (obj, hookMethods, fn, classHook, context, proxyHandler) {
      const opts = args[0];
      if (util.isObj(opts) && opts.parentObj && opts.hookMethods) {
        opts.type = type;
      }
      return t.hook.apply(t, args)
    }
  }

  before (obj, hookMethods, fn, classHook, context, proxyHandler) {
    return this.hook(obj, hookMethods, fn, 'before', classHook, context, proxyHandler)
  }

  after (obj, hookMethods, fn, classHook, context, proxyHandler) {
    return this.hook(obj, hookMethods, fn, 'after', classHook, context, proxyHandler)
  }

  replace (obj, hookMethods, fn, classHook, context, proxyHandler) {
    return this.hook(obj, hookMethods, fn, 'replace', classHook, context, proxyHandler)
  }

  error (obj, hookMethods, fn, classHook, context, proxyHandler) {
    return this.hook(obj, hookMethods, fn, 'error', classHook, context, proxyHandler)
  }

  hangUp (obj, hookMethods, fn, classHook, context, proxyHandler) {
    return this.hook(obj, hookMethods, fn, 'hangUp', classHook, context, proxyHandler)
  }
}

const hookJs = new HookJs(true);

/**
 */

function hackDefineProperCore (target, key, option) {
  if (option && target && target instanceof Element && typeof key === 'string' && key.indexOf('on') >= 0) {
    option.configurable = true;
  }

  if (target instanceof HTMLVideoElement) {
    const unLockProperties = ['playbackRate', 'currentTime', 'volume', 'muted'];
    if (unLockProperties.includes(key)) {
      try {
        debug.log(`${key}`);
        option.configurable = true;
        key = key + '_hack';
      } catch (e) {
        debug.error(`${key}`, e);
      }
    }
  }

  return [target, key, option]
}

function hackDefineProperOnError (args, parentObj, methodName, originMethod, execInfo, ctx) {
  debug.error(`${methodName} error:`, execInfo.error);

  return 'SKIP-ERROR'
}

function hackDefineProperty () {
  hookJs.before(Object, 'defineProperty', function (args, parentObj, methodName, originMethod, execInfo, ctx) {
    const option = args[2];
    const ele = args[0];
    const key = args[1];
    const afterArgs = hackDefineProperCore(ele, key, option);
    afterArgs.forEach((arg, i) => {
      args[i] = arg;
    });
  });

  hookJs.before(Object, 'defineProperties', function (args, parentObj, methodName, originMethod, execInfo, ctx) {
    const properties = args[1];
    const ele = args[0];
    if (ele && ele instanceof Element) {
      Object.keys(properties).forEach(key => {
        const option = properties[key];
        const afterArgs = hackDefineProperCore(ele, key, option);
        args[0] = afterArgs[0];
        delete properties[key];
        properties[afterArgs[1]] = afterArgs[2];
      });
    }
  });

  hookJs.error(Object, 'defineProperty', hackDefineProperOnError);
  hookJs.error(Object, 'defineProperties', hackDefineProperOnError);
}

/*!
 * @name      menuCommand.js
 * @version   0.0.1
 * @author    Blaze
 * @date      2019/9/21 14:22
 */

const monkeyMenu = {
  menuIds: {},
  on (title, fn, accessKey) {
    if (title instanceof Function) {
      title = title();
    }

    if (window.GM_registerMenuCommand) {
      const menuId = window.GM_registerMenuCommand(title, fn, accessKey);

      this.menuIds[menuId] = {
        title,
        fn,
        accessKey
      };

      return menuId
    }
  },

  off (id) {
    if (window.GM_unregisterMenuCommand) {
      delete this.menuIds[id];

      /**
       */
      // return window.GM_unregisterMenuCommand(id)
    }
  },

  clear () {
    Object.keys(this.menuIds).forEach(id => {
      this.off(id);
    });
  },

  /**
   */
  build (menuOpts) {
    this.clear();

    if (Array.isArray(menuOpts)) {
      menuOpts.forEach(menu => {
        if (menu.disable === true) { return }
        this.on(menu.title, menu.fn, menu.accessKey);
      });
    } else if (menuOpts instanceof Function) {
      const menuList = menuOpts();
      if (Array.isArray(menuList)) {
        this._menuBuilder_ = menuOpts;

        menuList.forEach(menu => {
          if (menu.disable === true) { return }

          const menuFn = () => {
            try {
              menu.fn.apply(menu, arguments);
            } catch (e) {
              console.error('[monkeyMenu]', menu.title, e);
            }

            setTimeout(() => {
              // console.log('[monkeyMenu rebuild]', menu.title)
              this.build(this._menuBuilder_);
            }, 100);
          };

          this.on(menu.title, menuFn, menu.accessKey);
        });
      } else {
        console.error('monkeyMenu build error, no menuList return', menuOpts);
      }
    }
  }
};

const version = '4.2.7';

function refreshPage(msg) {
  msg = msg || '';
  const status = confirm(msg);
  if (status) {
    window.location.reload();
  }
}

const isChinese = () => i18n.language().indexOf('zh') > -1;

function getHomePage() {
  const homePageLinks = [
    'https://h5player.anzz.site/zh/',
    'https://h5player.anzz.top'
  ];

  return isChinese() ? homePageLinks[0] : homePageLinks[1]
}

function openDocsByPath(path) {
  if (typeof path !== 'string' || path.startsWith('http') === true) {
    return false
  }

  if (!path.startsWith('/')) {
    path = '/' + path;
  }

  const chinese = isChinese();
  const basePath = chinese ? 'https://h5player.anzz.site' : 'https://h5player.anzz.top';
  let url = basePath + path;

  if (chinese && !path.startsWith('/zh')) {
    url = basePath + '/zh' + path;
  }

  openInTab(url);
}

/**
 */
const globalFunctional = {
  openInTab,
  getHomePageLink: {
    title: i18n.t('website'),
    desc: i18n.t('website'),
    fn: () => getHomePage()
  },

  openWebsite: {
    title: i18n.t('website'),
    desc: i18n.t('website'),
    fn: () => openInTab(getHomePage())
  },
  openAuthorHomePage: {
    title: i18n.t('aboutAuthor'),
    desc: i18n.t('aboutAuthor'),
    fn: () => { openInTab('https://github.com/xxxily'); }
  },
  openHotkeysPage: {
    title: i18n.t('hotkeysDocs'),
    desc: i18n.t('hotkeysDocs'),
    fn: () => {
      const hotkeysDocs = [
        'https://h5player.anzz.site/zh/home/quickStart#%E5%BF%AB%E6%8D%B7%E9%94%AE%E5%88%97%E8%A1%A8',
        'https://h5player.anzz.top/home/quickStart#shortcut-key-list'
      ];
      openInTab(isChinese() ? hotkeysDocs[0] : hotkeysDocs[1]);
    }
  },
  openProjectGithub: {
    title: 'GitHub',
    desc: 'GitHub',
    fn: () => openInTab('https://github.com/xxxily/h5player')
  },
  openIssuesPage: {
    title: i18n.t('issues'),
    desc: i18n.t('issues'),
    fn: () => openInTab('https://github.com/xxxily/h5player/issues')
  },
  openDonatePage: {
    title: i18n.t('donate'),
    desc: i18n.t('donate'),
    fn: () => openDocsByPath('/home/rewardTheAuthor')
  },
  openAboutDonatePage: {
    title: i18n.t('aboutDonate'),
    desc: i18n.t('aboutDonate'),
    fn: () => openDocsByPath('/home/aboutDonate')
  },
  openAiProjectsPage: {
    title: i18n.t('aiProjects'),
    desc: i18n.t('aiProjects'),
    fn: () => openInTab('https://hello-ai.anzz.site/home/categories.html')
  },
  openAddGroupChatPage: {
    title: i18n.t('addGroupChat'),
    desc: i18n.t('addGroupChat'),
    fn: () => {
      const groupChatUrl = isChinese() ? 'https://h5player.anzz.site/zh/home/quickStart#%E4%BA%A4%E6%B5%81%E7%BE%A4' : 'https://h5player.anzz.top/home/quickStart#discussion-groups';
      openInTab(groupChatUrl);
    }
  },
  openChangeLogPage: {
    title: i18n.t('changeLog'),
    desc: i18n.t('changeLog'),
    fn: () => openDocsByPath('/home/changeLog')
  },
  openCheckVersionPage: {
    title: i18n.t('checkVersion'),
    desc: i18n.t('checkVersion'),
    fn: () => {
      const confirm = window.confirm(`${i18n.t('currentVersion')}${version}\n${i18n.t('checkVersion')}`);
      if (confirm) {
        openInTab('https://greasyfork.org/zh-CN/scripts/381682/versions');
      }
    }
  },
  openRecommendPage: {
    title: i18n.t('recommend'),
    desc: i18n.t('recommend'),
    fn: () => {
      function randomZeroOrOne() {
        return Math.floor(Math.random() * 2)
      }

      if (randomZeroOrOne()) {
        openInTab('https://hello-ai.anzz.top/home/');
      } else {
        openInTab('https://github.com/xxxily/hello-ai');
      }
    }
  },
  openCustomConfigurationEditor: {
    title: i18n.t('openCustomConfigurationEditor'),
    desc: i18n.t('openCustomConfigurationEditor'),
    fn: () => {
      const jsoneditorUrl = isChinese()
        ? 'https://h5player.anzz.site/tools/json-editor/index.html?mode=tree&saveHandlerName=saveH5PlayerConfig&expandAll=true&json='
        : 'https://h5player.anzz.top/tools/json-editor/index.html?mode=tree&saveHandlerName=saveH5PlayerConfig&expandAll=true&json=';
      openInTab(jsoneditorUrl);
    }
  },

  openDocsLink: {
    title: i18n.t('openDocsLink'),
    desc: i18n.t('openDocsLink'),
    fn: (path) => openDocsByPath(path)
  },

  toggleExpandedOrCollapsedStateOfMonkeyMenu: {
    title: `${configManager.get('enhance.unfoldMenu') ? i18n.t('foldMenu') : i18n.t('unfoldMenu')} ${i18n.t('globalSetting')}`,
    desc: `${configManager.get('enhance.unfoldMenu') ? i18n.t('foldMenu') : i18n.t('unfoldMenu')} ${i18n.t('globalSetting')}`,
    fn: () => {
      const confirm = window.confirm(configManager.get('enhance.unfoldMenu') ? i18n.t('foldMenu') : i18n.t('unfoldMenu'));
      if (confirm) {
        configManager.setGlobalStorage('enhance.unfoldMenu', !configManager.get('enhance.unfoldMenu'));
        window.location.reload();
      }
    }
  },
  toggleScriptEnableState: {
    title: `${(configManager.get('blacklist.domains') || []).includes(location.host) ? i18n.t('enableScript') : i18n.t('disableScript')} ${i18n.t('localSetting')}`,
    desc: `${(configManager.get('blacklist.domains') || []).includes(location.host) ? i18n.t('enableScript') : i18n.t('disableScript')} ${i18n.t('localSetting')}`,
    fn: () => {
      const blackDomainList = configManager.get('blacklist.domains') || [];
      const isInBlacklist = blackDomainList.includes(location.host);
      const confirm = window.confirm(isInBlacklist ? i18n.t('enableScript') : i18n.t('disableScript'));
      if (confirm) {
        if (isInBlacklist) {
          configManager.setGlobalStorage('blacklist.domains', blackDomainList.filter(item => item !== location.host));
        } else {
          configManager.setGlobalStorage('blacklist.domains', blackDomainList.concat(location.host));
        }

        window.location.reload();
      }
    }
  },
  toggleSetCurrentTimeFunctional: {
    title: () => `${configManager.get('enhance.blockSetCurrentTime') ? i18n.t('unblockSetCurrentTime') : i18n.t('blockSetCurrentTime')} ${i18n.t('localSetting')}`,
    desc: () => `${configManager.get('enhance.blockSetCurrentTime') ? i18n.t('unblockSetCurrentTime') : i18n.t('blockSetCurrentTime')} ${i18n.t('localSetting')}`,
    fn: () => {
      const confirm = window.confirm(configManager.get('enhance.blockSetCurrentTime') ? i18n.t('unblockSetCurrentTime') : i18n.t('blockSetCurrentTime'));
      if (confirm) {
        configManager.setLocalStorage('enhance.blockSetCurrentTime', !configManager.get('enhance.blockSetCurrentTime'));
        window.location.reload();
      }
    }
  },
  toggleSetVolumeFunctional: {
    title: () => `${configManager.get('enhance.blockSetVolume') ? i18n.t('unblockSetVolume') : i18n.t('blockSetVolume')} ${i18n.t('localSetting')}`,
    desc: () => `${configManager.get('enhance.blockSetVolume') ? i18n.t('unblockSetVolume') : i18n.t('blockSetVolume')} ${i18n.t('localSetting')}`,
    fn: () => {
      const confirm = window.confirm(configManager.get('enhance.blockSetVolume') ? i18n.t('unblockSetVolume') : i18n.t('blockSetVolume'));
      if (confirm) {
        configManager.setLocalStorage('enhance.blockSetVolume', !configManager.get('enhance.blockSetVolume'));
        window.location.reload();
      }
    }
  },
  toggleSetPlaybackRateFunctional: {
    title: () => `${configManager.get('enhance.blockSetPlaybackRate') ? i18n.t('unblockSetPlaybackRate') : i18n.t('blockSetPlaybackRate')} ${i18n.t('globalSetting')}`,
    desc: () => `${configManager.get('enhance.blockSetPlaybackRate') ? i18n.t('unblockSetPlaybackRate') : i18n.t('blockSetPlaybackRate')} ${i18n.t('globalSetting')}`,
    fn: () => {
      const confirm = window.confirm(configManager.get('enhance.blockSetPlaybackRate') ? i18n.t('unblockSetPlaybackRate') : i18n.t('blockSetPlaybackRate'));
      if (confirm) {
        configManager.setGlobalStorage('enhance.blockSetPlaybackRate', !configManager.get('enhance.blockSetPlaybackRate'));
        window.location.reload();
      }
    }
  },
  toggleAcousticGainFunctional: {
    title: () => `${configManager.get('enhance.allowAcousticGain') ? i18n.t('notAllowAcousticGain') : i18n.t('allowAcousticGain')} ${i18n.t('globalSetting')}`,
    desc: () => `${configManager.get('enhance.allowAcousticGain') ? i18n.t('notAllowAcousticGain') : i18n.t('allowAcousticGain')} ${i18n.t('globalSetting')}`,
    fn: () => {
      const confirm = window.confirm(configManager.get('enhance.allowAcousticGain') ? i18n.t('notAllowAcousticGain') : i18n.t('allowAcousticGain'));
      if (confirm) {
        configManager.setGlobalStorage('enhance.allowAcousticGain', !configManager.getGlobalStorage('enhance.allowAcousticGain'));
        window.location.reload();
      }
    }
  },
  toggleCrossOriginControlFunctional: {
    title: () => `${configManager.get('enhance.allowCrossOriginControl') ? i18n.t('notAllowCrossOriginControl') : i18n.t('allowCrossOriginControl')} ${i18n.t('globalSetting')}`,
    desc: () => `${configManager.get('enhance.allowCrossOriginControl') ? i18n.t('notAllowCrossOriginControl') : i18n.t('allowCrossOriginControl')} ${i18n.t('globalSetting')}`,
    fn: () => {
      const confirm = window.confirm(configManager.get('enhance.allowCrossOriginControl') ? i18n.t('notAllowCrossOriginControl') : i18n.t('allowCrossOriginControl'));
      if (confirm) {
        configManager.setGlobalStorage('enhance.allowCrossOriginControl', !configManager.getGlobalStorage('enhance.allowCrossOriginControl'));
        window.location.reload();
      }
    }
  },
  toggleExperimentFeatures: {
    title: () => `${configManager.get('enhance.allowExperimentFeatures') ? i18n.t('notAllowExperimentFeatures') : i18n.t('allowExperimentFeatures')} ${i18n.t('globalSetting')}`,
    desc: () => `${configManager.get('enhance.allowExperimentFeatures') ? i18n.t('notAllowExperimentFeatures') : i18n.t('allowExperimentFeatures')} ${i18n.t('globalSetting')}`,
    fn: () => {
      const confirm = window.confirm(configManager.get('enhance.allowExperimentFeatures') ? i18n.t('notAllowExperimentFeatures') : i18n.t('experimentFeaturesWarning'));
      if (confirm) {
        configManager.setGlobalStorage('enhance.allowExperimentFeatures', !configManager.get('enhance.allowExperimentFeatures'));
        window.location.reload();
      }
    }
  },
  toggleExternalCustomConfiguration: {
    title: () => `${configManager.get('enhance.allowExternalCustomConfiguration') ? i18n.t('notAllowExternalCustomConfiguration') : i18n.t('allowExternalCustomConfiguration')} ${i18n.t('globalSetting')}`,
    desc: () => `${configManager.get('enhance.allowExternalCustomConfiguration') ? i18n.t('notAllowExternalCustomConfiguration') : i18n.t('allowExternalCustomConfiguration')} ${i18n.t('globalSetting')}`,
    fn: () => {
      const confirm = window.confirm(configManager.get('enhance.allowExternalCustomConfiguration') ? i18n.t('notAllowExternalCustomConfiguration') : i18n.t('allowExternalCustomConfiguration'));
      if (confirm) {
        configManager.setGlobalStorage('enhance.allowExternalCustomConfiguration', !configManager.getGlobalStorage('enhance.allowExternalCustomConfiguration'));
        window.location.reload();
      }
    }
  },
  toggleDebugMode: {
    title: () => `${configManager.getGlobalStorage('debug') ? i18n.t('closeDebugMode') : i18n.t('openDebugMode')} ${i18n.t('globalSetting')}`,
    desc: () => `${configManager.getGlobalStorage('debug') ? i18n.t('closeDebugMode') : i18n.t('openDebugMode')} ${i18n.t('globalSetting')}`,
    fn: () => {
      const confirm = window.confirm(configManager.getGlobalStorage('debug') ? i18n.t('closeDebugMode') : i18n.t('openDebugMode'));
      if (confirm) {
        configManager.setGlobalStorage('debug', !configManager.getGlobalStorage('debug'));
        window.location.reload();
      }
    }
  },

  restoreGlobalConfiguration: {
    title: i18n.t('restoreConfiguration'),
    desc: i18n.t('restoreConfiguration'),
    fn: () => {
      configManager.clear();
      refreshPage();
    }
  },
  openCrossOriginFramePage: {
    title: i18n.t('openCrossOriginFramePage'),
    desc: i18n.t('openCrossOriginFramePage'),
    fn: () => {
      openInTab(location.href);
    }
  },

  toggleGUIStatus: {
    title: () => `${configManager.getGlobalStorage('ui.enable') === false ? i18n.t('enableGUI') : i18n.t('disableGUI')} ${i18n.t('globalSetting')}`,
    desc: () => `${configManager.getGlobalStorage('ui.enable') === false ? i18n.t('enableGUI') : i18n.t('disableGUI')} ${i18n.t('globalSetting')}`,
    fn: () => {
      const confirm = window.confirm(`${configManager.getGlobalStorage('ui.enable') === false ? i18n.t('enableGUI') : i18n.t('disableGUI')} ${i18n.t('globalSetting')}`);
      if (confirm) {
        configManager.setGlobalStorage('ui.enable', !configManager.getGlobalStorage('ui.enable'));
        window.location.reload();
      }
    }
  },

  toggleGUIStatusUnderCurrentSite: {
    title: () => `${configManager.getLocalStorage('ui.enable') === false ? i18n.t('enableGUI') : i18n.t('disableGUI')} ${i18n.t('localSetting')}`,
    desc: () => `${configManager.getLocalStorage('ui.enable') === false ? i18n.t('enableGUI') : i18n.t('disableGUI')} ${i18n.t('localSetting')}`,
    fn: () => {
      const confirm = window.confirm(`${configManager.getLocalStorage('ui.enable') === false ? i18n.t('enableGUI') : i18n.t('disableGUI')} ${i18n.t('localSetting')}`);
      if (confirm) {
        configManager.setLocalStorage('ui.enable', !configManager.getLocalStorage('ui.enable'));
        window.location.reload();
      }
    }
  },
  alwaysShowGraphicalInterface: {
    title: `${i18n.t('toggleStates')}${i18n.t('alwaysShowGraphicalInterface')} ${i18n.t('globalSetting')}`,
    desc: `${i18n.t('toggleStates')}${i18n.t('alwaysShowGraphicalInterface')} ${i18n.t('globalSetting')}`,
    fn: () => {
      const alwaysShow = configManager.getGlobalStorage('ui.alwaysShow');
      const confirm = window.confirm(alwaysShow === true ? `${i18n.t('disable')}${i18n.t('alwaysShowGraphicalInterface')} ${i18n.t('globalSetting')}` : `${i18n.t('alwaysShowGraphicalInterface')} ${i18n.t('globalSetting')}`);
      if (confirm) {
        configManager.setGlobalStorage('ui.alwaysShow', !alwaysShow);
        window.location.reload();
      }
    }
  },

  toggleHotkeysStatus: {
    title: () => `${configManager.getGlobalStorage('enableHotkeys') === false ? i18n.t('enableHotkeys') : i18n.t('disableHotkeys')} ${i18n.t('globalSetting')}`,
    desc: () => `${configManager.getGlobalStorage('enableHotkeys') === false ? i18n.t('enableHotkeys') : i18n.t('disableHotkeys')} ${i18n.t('globalSetting')}`,
    fn: () => {
      const confirm = window.confirm(`${configManager.getGlobalStorage('enableHotkeys') === false ? i18n.t('enableHotkeys') : i18n.t('disableHotkeys')} ${i18n.t('globalSetting')}`);
      if (confirm) {
        configManager.setGlobalStorage('enableHotkeys', !configManager.getGlobalStorage('enableHotkeys'));
        window.location.reload();
      }
    }
  },

  toggleHotkeysStatusUnderCurrentSite: {
    title: () => `${configManager.getLocalStorage('enableHotkeys') === false ? i18n.t('enableHotkeys') : i18n.t('disableHotkeys')} ${i18n.t('localSetting')}`,
    desc: () => `${configManager.getLocalStorage('enableHotkeys') === false ? i18n.t('enableHotkeys') : i18n.t('disableHotkeys')} ${i18n.t('localSetting')}`,
    fn: () => {
      const confirm = window.confirm(`${configManager.getLocalStorage('enableHotkeys') === false ? i18n.t('enableHotkeys') : i18n.t('disableHotkeys')} ${i18n.t('localSetting')}`);
      if (confirm) {
        configManager.setLocalStorage('enableHotkeys', !configManager.getLocalStorage('enableHotkeys'));
        window.location.reload();
      }
    }
  },

  toggleMouseControl: {
    title: () => `${configManager.getGlobalStorage('mouse.enable') === false ? i18n.t('mouse.enable') : i18n.t('mouse.disable')} ${i18n.t('globalSetting')}`,
    desc: () => `${configManager.getGlobalStorage('mouse.enable') === false ? i18n.t('mouse.enable') : i18n.t('mouse.disable')} ${i18n.t('globalSetting')}`,
    fn: () => {
      const confirm = window.confirm(`${configManager.getGlobalStorage('mouse.enable') === false ? i18n.t('mouse.enable') : i18n.t('mouse.disable')} ${i18n.t('globalSetting')}`);
      if (confirm) {
        configManager.setGlobalStorage('mouse.enable', !configManager.getGlobalStorage('mouse.enable'));
        window.location.reload();
      }
    }
  },

  toggleMouseControlUnderCurrentSite: {
    title: () => `${configManager.getLocalStorage('mouse.enable') === false ? i18n.t('mouse.enable') : i18n.t('mouse.disable')} ${i18n.t('localSetting')}`,
    desc: () => `${configManager.getLocalStorage('mouse.enable') === false ? i18n.t('mouse.enable') : i18n.t('mouse.disable')} ${i18n.t('localSetting')}`,
    fn: () => {
      const confirm = window.confirm(`${configManager.getLocalStorage('mouse.enable') === false ? i18n.t('mouse.enable') : i18n.t('mouse.disable')} ${i18n.t('localSetting')}`);
      if (confirm) {
        configManager.setLocalStorage('mouse.enable', !configManager.getLocalStorage('mouse.enable'));
        window.location.reload();
      }
    }
  },

  setMouseLongPressTime: {
    title: `${i18n.t('mouse.longPressTime')}${i18n.t('globalSetting')}`,
    desc: `${i18n.t('mouse.longPressTime')}${i18n.t('globalSetting')}`,
    fn: () => {
      const longPressTime = prompt(`${i18n.t('mouse.longPressTime')}${i18n.t('globalSetting')}`, configManager.getGlobalStorage('mouse.longPressTime') || 600);
      if (longPressTime) {
        configManager.setGlobalStorage('mouse.longPressTime', Number(longPressTime));
        window.location.reload();
      }
    }
  },

  toggleDownloadControl: {
    title: () => `${configManager.getGlobalStorage('download.enable') === false ? i18n.t('mediaDownload.enable') : i18n.t('mediaDownload.disable')} ${i18n.t('globalSetting')}`,
    desc: () => `${configManager.getGlobalStorage('download.enable') === false ? i18n.t('mediaDownload.enable') : i18n.t('mediaDownload.disable')} ${i18n.t('globalSetting')}`,
    fn: () => {
      const confirm = window.confirm(`${configManager.getGlobalStorage('download.enable') === false ? i18n.t('mediaDownload.enable') : i18n.t('mediaDownload.disable')} ${i18n.t('globalSetting')}`);
      if (confirm) {
        configManager.setGlobalStorage('download.enable', !configManager.getGlobalStorage('download.enable'));
        window.location.reload();
      }
    }
  },

  toggleDownloadControlUnderCurrentSite: {
    title: () => `${configManager.getLocalStorage('download.enable') === false ? i18n.t('mediaDownload.enable') : i18n.t('mediaDownload.disable')} ${i18n.t('localSetting')}`,
    desc: () => `${configManager.getLocalStorage('download.enable') === false ? i18n.t('mediaDownload.enable') : i18n.t('mediaDownload.disable')} ${i18n.t('localSetting')}`,
    fn: () => {
      const confirm = window.confirm(`${configManager.getLocalStorage('download.enable') === false ? i18n.t('mediaDownload.enable') : i18n.t('mediaDownload.disable')} ${i18n.t('localSetting')}`);
      if (confirm) {
        configManager.setLocalStorage('download.enable', !configManager.getLocalStorage('download.enable'));
        window.location.reload();
      }
    }
  },

  setLanguage: {
    title: `${i18n.t('languageSettings')}${i18n.t('globalSetting')}`,
    desc: `${i18n.t('languageSettings')}${i18n.t('globalSetting')}`,
    fn: (lang) => {
      const confirm = window.confirm(`${i18n.t('languageSettings')}[${lang}] ?`);
      if (confirm) {
        if (lang === 'auto' || i18n.languages()[lang]) {
          configManager.setGlobalStorage('language', lang);
          window.location.reload();
        } else {
          alert('Language not found');
        }
      }
    }
  },

  cleanRemoteHelperInfo: {
    title: i18n.t('cleanRemoteHelperInfo'),
    desc: i18n.t('cleanRemoteHelperInfo'),
    fn: () => {
      configManager.setGlobalStorage('recommendList', false);
      configManager.setGlobalStorage('contactRemoteHelperSuccessTime', false);
      configManager.setGlobalStorage('lastContactRemoteHelperTime', false);
      window.location.reload();
    }
  }
};

/*!
 * @name         menuManager.js
 * @version      0.0.1
 * @author       xxxily
 * @date         2022/08/11 10:05
 * @github       https://github.com/xxxily
 */

let monkeyMenuList = [
  { ...globalFunctional.openWebsite },
  // { ...globalFunctional.openHotkeysPage },
  {
    ...globalFunctional.openIssuesPage,
    disable: !configManager.get('enhance.unfoldMenu')
  },
  { ...globalFunctional.openDonatePage },
  { ...globalFunctional.openAiProjectsPage },
  {
    ...globalFunctional.toggleScriptEnableState
  },
  {
    ...globalFunctional.toggleGUIStatusUnderCurrentSite,
    disable: configManager.getLocalStorage('ui.enable') !== false
  },
  {
    ...globalFunctional.toggleGUIStatus,
    disable: configManager.getGlobalStorage('ui.enable') === false ? false : !configManager.get('enhance.unfoldMenu')
  },
  {
    ...globalFunctional.toggleHotkeysStatusUnderCurrentSite,
    disable: configManager.getLocalStorage('enableHotkeys') !== false
  },
  {
    ...globalFunctional.toggleHotkeysStatus,
    disable: configManager.get('enableHotkeys') !== false
  },
  { ...globalFunctional.openCustomConfigurationEditor },
  { ...globalFunctional.toggleExpandedOrCollapsedStateOfMonkeyMenu },
  {
    ...globalFunctional.restoreGlobalConfiguration,
    disable: !configManager.get('enhance.unfoldMenu')
  }
];

function menuBuilder () {
  return monkeyMenuList
}

function menuRegister () {
  monkeyMenu.build(menuBuilder);
}

/**
 */
function addMenu (menuOpts, before) {
  menuOpts = Array.isArray(menuOpts) ? menuOpts : [menuOpts];
  menuOpts = menuOpts.filter(item => item.title && !item.disabled);

  if (before) {
    monkeyMenuList = menuOpts.concat(monkeyMenuList);
  } else {
    monkeyMenuList = monkeyMenuList.concat(menuOpts);
  }

  menuRegister();
}

/**
 */
function registerH5playerMenus (h5player) {
  const t = h5player;
  const player = t.player();
  const foldMenu = !configManager.get('enhance.unfoldMenu');

  if (player && !t._hasRegisterH5playerMenus_) {
    const menus = [
      {
        ...globalFunctional.openCrossOriginFramePage,
        disable: foldMenu || !isInCrossOriginFrame()
      },
      {
        ...globalFunctional.toggleSetCurrentTimeFunctional,
        type: 'local',
        disable: foldMenu
      },
      {
        ...globalFunctional.toggleSetVolumeFunctional,
        type: 'local',
        disable: foldMenu
      },
      {
        ...globalFunctional.toggleSetPlaybackRateFunctional,
        type: 'global',
        disable: foldMenu
      },
      {
        ...globalFunctional.toggleAcousticGainFunctional,
        type: 'global',
        disable: foldMenu
      },
      {
        ...globalFunctional.toggleCrossOriginControlFunctional,
        type: 'global',
        disable: foldMenu
      },
      {
        ...globalFunctional.toggleExperimentFeatures,
        type: 'global',
        disable: foldMenu
      },
      {
        ...globalFunctional.toggleExternalCustomConfiguration,
        type: 'global',
        disable: foldMenu
      },
      {
        ...globalFunctional.toggleDebugMode,
        disable: foldMenu
      }
    ];

    let titlePrefix = '';
    if (isInIframe()) {
      titlePrefix = `[${location.hostname}]`;

      menus.forEach(menu => {
        const titleFn = menu.title;
        if (titleFn instanceof Function && menu.type === 'local') {
          menu.title = () => titlePrefix + titleFn();
        }
      });
    }

    addMenu(menus);

    t._hasRegisterH5playerMenus_ = true;
  }
}

/**
   * @param {*} player
   * @returns
   */
function proxyHTMLMediaElementEvent () {
  if (HTMLMediaElement.prototype._rawAddEventListener_) {
    return false
  }

  HTMLMediaElement.prototype._rawAddEventListener_ = HTMLMediaElement.prototype.addEventListener;
  HTMLMediaElement.prototype._rawRemoveEventListener_ = HTMLMediaElement.prototype.removeEventListener;

  HTMLMediaElement.prototype.addEventListener = new Proxy(HTMLMediaElement.prototype.addEventListener, {
    apply (target, ctx, args) {
      const eventName = args[0];
      const listener = args[1];
      if (listener instanceof Function && eventName === 'ratechange') {

        args[1] = new Proxy(listener, {
          apply (target, ctx, args) {
            if (ctx) {
              if (ctx.playbackRate && eventName === 'ratechange') {
                if (ctx._hasBlockRatechangeEvent_) {
                  return true
                }

                const oldRate = ctx.playbackRate;
                const startTime = Date.now();

                const result = target.apply(ctx, args);

                /**
                 */
                const blockRatechangeBehave1 = oldRate !== ctx.playbackRate || Date.now() - startTime > 1000;
                const blockRatechangeBehave2 = ctx._setPlaybackRate_ && ctx._setPlaybackRate_.value !== ctx.playbackRate;
                if (blockRatechangeBehave1 || blockRatechangeBehave2) {
                  debug.info(`[execVideoEvent][${eventName}]${eventName}`, listener);
                  ctx._hasBlockRatechangeEvent_ = true;
                  return true
                } else {
                  return result
                }
              }
            }

            try {
              return target.apply(ctx, args)
            } catch (e) {
              debug.error(`[proxyPlayerEvent][${eventName}]`, listener, e);
            }
          }
        });
      }

      return target.apply(ctx, args)
    }
  });
}

const mediaSource = (function () {
  let hasMediaSourceInit = false;
  const originMethods = {};
  const originURLMethods = {};
  const mediaSourceMap = new original.Map();
  const objectURLMap = new original.Map();

  function connectMediaSourceWithMediaElement (mediaEl) {
    const curSrc = mediaEl.currentSrc || mediaEl.src;

    if (!curSrc) { return false }

    mediaSourceMap.forEach(mediaSourceInfo => {
      if (mediaSourceInfo.mediaSource.__objURL__ && curSrc === mediaSourceInfo.mediaSource.__objURL__) {
        mediaSourceInfo.mediaElement = mediaEl;
      }
    });
  }

  function cleanMediaSourceData () {
    function removeMediaSourceData (mediaSourceInfo) {
      console.log('[cleanMediaSourceData][removeMediaSourceData]', mediaSourceInfo.mediaUrl || mediaSourceInfo.mediaSource.__objURL__);

      if (mediaSourceInfo.sourceBuffer && mediaSourceInfo.sourceBuffer.length) {
        mediaSourceInfo.sourceBuffer.forEach(sourceBufferItem => {
          sourceBufferItem.bufferData = [];
          sourceBufferItem.originAppendBuffer = null;
        });
        mediaSourceInfo.sourceBuffer = [];
      }

      mediaSourceInfo.mediaElement = null;

      original.map.delete.call(mediaSourceMap, mediaSourceInfo.mediaSource);
      original.map.delete.call(objectURLMap, mediaSourceInfo.mediaSource);
    }

    mediaSourceMap.forEach((mediaSourceInfo) => {
      if (!mediaSourceInfo.mediaElement || !(mediaSourceInfo.mediaElement instanceof HTMLMediaElement)) {
        removeMediaSourceData(mediaSourceInfo);
      } else {
        if (isOutOfDocument(mediaSourceInfo.mediaElement)) {
          removeMediaSourceData(mediaSourceInfo);
        }
      }
    });
  }

  function proxyMediaSourceMethod () {
    if (!originMethods.addSourceBuffer || !originMethods.endOfStream) {
      return false
    }

    originURLMethods.createObjectURL = originURLMethods.createObjectURL || URL.prototype.constructor.createObjectURL;
    URL.prototype.constructor.createObjectURL = new original.Proxy(originURLMethods.createObjectURL, {
      apply (target, ctx, args) {
        const object = args[0];
        const objectURL = target.apply(ctx, args);

        if (object instanceof MediaSource && !original.map.has.call(objectURLMap, object)) {
          object.__objURL__ = objectURL;
          original.map.set.call(objectURLMap, object, objectURL);
        }

        return objectURL
      }
    });

    MediaSource.prototype.addSourceBuffer = new original.Proxy(originMethods.addSourceBuffer, {
      apply (target, ctx, args) {
        if (!original.map.has.call(mediaSourceMap, ctx)) {
          original.map.set.call(mediaSourceMap, ctx, {
            mediaSource: ctx,
            createTime: Date.now(),
            sourceBuffer: [],
            endOfStream: false
          });
        }

        const mediaSourceInfo = original.map.get.call(mediaSourceMap, ctx);
        const mimeCodecs = args[0] || '';
        const sourceBuffer = target.apply(ctx, args);

        const sourceBufferItem = {
          mimeCodecs,
          originAppendBuffer: sourceBuffer.appendBuffer,
          bufferData: [],
          mediaInfo: {}
        };

        try {
          const mediaInfo = sourceBufferItem.mediaInfo;
          const tmpArr = sourceBufferItem.mimeCodecs.split(';');

          mediaInfo.type = tmpArr[0].split('/')[0];
          mediaInfo.format = tmpArr[0].split('/')[1];
          mediaInfo.codecs = tmpArr[1].trim().replace('codecs=', '').replace(/["']/g, '');
        } catch (e) {
          original.console.error('[addSourceBuffer][mediaInfo] ', sourceBufferItem, e);
        }

        mediaSourceInfo.sourceBuffer.push(sourceBufferItem);

        sourceBuffer.appendBuffer = new original.Proxy(sourceBufferItem.originAppendBuffer, {
          apply (bufTarget, bufCtx, bufArgs) {
            const buffer = bufArgs[0];

            if (!mediaSourceInfo.endOfStream) {
              sourceBufferItem.bufferData.push(buffer);
            }

            if (original.map.get.call(objectURLMap, ctx)) {
              mediaSourceInfo.mediaUrl = original.map.get.call(objectURLMap, ctx);
            }

            if (!original.map.get.call(mediaSourceMap, ctx)) {
              original.map.set.call(mediaSourceMap, ctx, mediaSourceInfo);
            }

            return bufTarget.apply(bufCtx, bufArgs)
          }
        });

        return sourceBuffer
      }
    });

    MediaSource.prototype.endOfStream = new original.Proxy(originMethods.endOfStream, {
      apply (target, ctx, args) {
        const mediaSourceInfo = original.map.get.call(mediaSourceMap, ctx);
        if (mediaSourceInfo) {
          mediaSourceInfo.endOfStream = true;

          if (mediaSourceInfo.mediaElement && mediaSourceInfo.autoDownload && !mediaSourceInfo.hasDownload) {
            downloadMediaSource(mediaSourceInfo.mediaElement);
          }
        }

        return target.apply(ctx, args)
      }
    });
  }

  /**
   */
  function downloadMediaSource (mediaEl, title) {
    // const srcList = mediaEl.srcList || []
    const curSrc = mediaEl.currentSrc || mediaEl.src;

    if (!curSrc) {
      original.alert(i18n.t('mediaDownload.notSupport'));
      return false
    }

    let hasFindMediaSource = false;
    mediaSourceMap.forEach(mediaSourceInfo => {
      const mediaSource = mediaSourceInfo.mediaSource;
      if (!mediaSource.__objURL__) {
        console.error('no objURL', mediaSource, mediaSourceInfo);
        return false
      }

      // if (srcList.length > 0 && !srcList.includes(mediaSource.__objURL__)) {
      //   return false
      // }
      if (curSrc !== mediaSource.__objURL__) {
        return false
      }

      hasFindMediaSource = true;
      mediaSourceInfo.mediaElement = mediaEl;

      // original.console.log('[downloadMediaSource][mediaSourceInfo]', mediaSourceInfo)

      if (mediaSourceInfo.hasDownload) {
        const confirm = original.confirm(i18n.t('mediaDownload.hasDownload'));
        if (!confirm) {
          return false
        }
      }

      if (!mediaSourceInfo.hasDownload && !mediaSourceInfo.endOfStream) {

        const confirm = original.confirm(i18n.t('mediaDownload.notEndOfStream'));
        if (!confirm) {
          if (mediaSourceInfo.autoDownload) {
            const cancelAutoDownload = original.confirm(i18n.t('mediaDownload.cancelAutoDownload'));
            if (cancelAutoDownload) {
              mediaSourceInfo.autoDownload = false;
            }
          } else {
            const autoDownload = original.confirm(i18n.t('mediaDownload.autoDownload'));
            if (autoDownload) {
              mediaSourceInfo.autoDownload = true;
            }
          }

          return false
        }
      }

      let mediaSourceTitle = null;
      mediaSourceInfo.sourceBuffer.forEach(sourceBufferItem => {
        if (!sourceBufferItem.mimeCodecs || sourceBufferItem.mimeCodecs.toString().indexOf(';') === -1) {
          const msg = '[downloadMediaSource][mimeCodecs][error] mimeCodecs';
          original.console.error(msg, sourceBufferItem);
          original.alert(msg);
          return false
        }

        try {
          let mediaTitle = `${mediaSourceTitle || sourceBufferItem.mediaInfo.title || title || mediaEl.getAttribute('data-title') || document.title || Date.now()}`;

          if (!mediaSourceTitle && !sourceBufferItem.mediaInfo.title) {
            mediaTitle = original.prompt(i18n.t('mediaDownload.confirmTitle'), mediaTitle);

            if (!mediaTitle) { return false }

            sourceBufferItem.mediaInfo.title = mediaTitle;
          }

          mediaSourceTitle = mediaTitle;

          mediaTitle = `${mediaTitle}_${sourceBufferItem.mediaInfo.type}.${sourceBufferItem.mediaInfo.format}`;

          const a = document.createElement('a');
          const blobUrl = URL.createObjectURL(new Blob(sourceBufferItem.bufferData));
          a.href = blobUrl;
          a.download = mediaTitle;

          try {
            a.click();
            mediaSourceInfo.hasDownload = true;
          } finally {
            URL.revokeObjectURL(blobUrl);
            sourceBufferItem.bufferData = [];
          }
        } catch (e) {
          mediaSourceInfo.hasDownload = false;
          const msg = '[downloadMediaSource][error]';
          original.console.error(msg, e);
          original.alert(msg);
        }
      });
    });

    if (!hasFindMediaSource) {
      original.alert(i18n.t('mediaDownload.notFoundMediaSource'));
    }
  }

  function hasInit () {
    return hasMediaSourceInit
  }

  function init () {
    if (hasMediaSourceInit) {
      return false
    }

    if (!window.MediaSource) {
      return false
    }

    Object.keys(MediaSource.prototype).forEach(key => {
      try {
        if (MediaSource.prototype[key] instanceof Function) {
          originMethods[key] = MediaSource.prototype[key];
        }
      } catch (e) { }
    });

    proxyMediaSourceMethod();

    hasMediaSourceInit = true;
  }

  return {
    init,
    hasInit,
    originMethods,
    originURLMethods,
    mediaSourceMap,
    objectURLMap,
    downloadMediaSource,
    cleanMediaSourceData,
    connectMediaSourceWithMediaElement
  }
})();

/*!
 * @name         hotkeysRunner.js
 * @version      0.0.1
 * @author       xxxily
 * @date         2022/11/23 18:22
 * @github       https://github.com/xxxily
 */

const Map$1 = window.Map;
const WeakMap$1 = window.WeakMap;
function isObj (obj) { return Object.prototype.toString.call(obj) === '[object Object]' }

function getValByPath (obj, path) {
  path = path || '';
  const pathArr = path.split('.');
  let result = obj;

  for (let i = 0; i < pathArr.length; i++) {
    if (!result) break
    result = result[pathArr[i]];
  }

  return result
}

function toArrArgs (args) {
  return Array.isArray(args) ? args : (typeof args === 'undefined' ? [] : [args])
}

function isModifierKey (key) {
  return [
    'ctrl', 'controlleft', 'controlright',
    'shift', 'shiftleft', 'shiftright',
    'alt', 'altleft', 'altright',
    'meta', 'metaleft', 'metaright',
    'capsLock'].includes(key.toLowerCase())
}

const keyAlias = {
  ControlLeft: 'ctrl',
  ControlRight: 'ctrl',
  ShiftLeft: 'shift',
  ShiftRight: 'shift',
  AltLeft: 'alt',
  AltRight: 'alt',
  MetaLeft: 'meta',
  MetaRight: 'meta'
};

const combinationKeysMonitor = (function () {
  const combinationKeysState = new Map$1();

  const hasInit = new WeakMap$1();

  function init (win = window) {
    if (!win || win !== win.self || !win.addEventListener || hasInit.get(win)) {
      return false
    }

    const timers = {};

    function activeCombinationKeysState (event) {
      isModifierKey(event.code) && combinationKeysState.set(event.code, true);
    }

    function inactivateCombinationKeysState (event) {
      if (!(event instanceof KeyboardEvent)) {
        combinationKeysState.forEach((val, key) => {
          combinationKeysState.set(key, false);
        });
        return true
      }

      /**
       */
      if (isModifierKey(event.code)) {
        clearTimeout(timers[event.code]);
        timers[event.code] = setTimeout(() => { combinationKeysState.set(event.code, false); }, 50);
      }
    }

    win.addEventListener('keydown', activeCombinationKeysState, true);
    win.addEventListener('keypress', activeCombinationKeysState, true);
    win.addEventListener('keyup', inactivateCombinationKeysState, true);
    win.addEventListener('blur', inactivateCombinationKeysState, true);

    hasInit.set(win, true);
  }

  function getCombinationKeys () {
    const result = new Map$1();
    combinationKeysState.forEach((val, key) => {
      if (val === true) {
        result.set(key, val);
      }
    });
    return result
  }

  return {
    combinationKeysState,
    getCombinationKeys,
    init
  }
})();

class HotkeysRunner {
  constructor (hotkeys, win = window) {
    this.window = win;
    this.windowList = [win];
    this.MOD = typeof navigator === 'object' && /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? 'Meta' : 'Ctrl';
    // 'Control', 'Shift', 'Alt', 'Meta'

    this.prevPress = null;
    this._prevTimer_ = null;

    this.setHotkeys(hotkeys);
    combinationKeysMonitor.init(win);
  }

  setCombinationKeysMonitor (win) {
    this.window = win;

    if (!this.windowList.includes(win)) {
      this.windowList.push(win);
    }

    combinationKeysMonitor.init(win);
  }

  hotkeysPreprocess (hotkeys) {
    if (!Array.isArray(hotkeys)) {
      return false
    }

    hotkeys.forEach((config) => {
      if (!isObj(config) || !config.key || typeof config.key !== 'string') {
        return false
      }

      const keyName = config.key.trim().toLowerCase();
      const mod = this.MOD.toLowerCase();

      config.keyBindings = keyName.split(' ').map(press => {
        const keys = press.split(/\b\+/);
        const mods = [];
        let key = '';

        keys.forEach((k) => {
          k = k === '$mod' ? mod : k;

          if (isModifierKey(k)) {
            mods.push(k);
          } else {
            key = k;
          }
        });

        return [mods, key]
      });
    });

    return hotkeys
  }

  setHotkeys (hotkeys) {
    this.hotkeys = this.hotkeysPreprocess(hotkeys) || [];
  }

  /**
   * @param {KeyboardEvent} event
   * @param {Object} prevCombinationKeys
   * @returns
   */
  isMatch (event, press) {
    if (!event || !Array.isArray(press)) { return false }

    const combinationKeys = event.combinationKeys || combinationKeysMonitor.getCombinationKeys();
    const mods = press[0];
    const key = press[1];

    if (mods.length !== combinationKeys.size) {
      return false
    }

    if (key && event.key.toLowerCase() !== key && event.code.toLowerCase() !== key) {
      return false
    }

    let result = true;
    const modsKey = new Map$1();
    combinationKeys.forEach((val, key) => {
      modsKey.set(key, val);
      modsKey.set(key.toLowerCase(), val);
      keyAlias[key] && modsKey.set(keyAlias[key], val);
    });

    mods.forEach((key) => {
      if (!modsKey.has(key)) {
        result = false;
      }
    });

    return result
  }

  isMatchPrevPress (press) { return this.isMatch(this.prevPress, press) }

  run (opts = {}) {
    // const KeyboardEvent = this.window.KeyboardEvent
    // if (!(opts.event instanceof KeyboardEvent)) { return false }

    const KeyboardEventList = this.windowList.map(win => win.KeyboardEvent);
    if (!KeyboardEventList.includes(opts.event.constructor)) {
      return false
    }

    const event = opts.event;
    const target = opts.target || null;
    const conditionHandler = opts.conditionHandler || opts.whenHandler;

    let matchResult = null;

    this.hotkeys.forEach(hotkeyConf => {
      if (hotkeyConf.disabled || !hotkeyConf.keyBindings) {
        return false
      }

      let press = hotkeyConf.keyBindings[0];

      if (this.prevPress && (hotkeyConf.keyBindings.length <= 1 || !this.isMatchPrevPress(press))) {
        return false
      }

      if (this.prevPress && hotkeyConf.keyBindings.length > 1 && this.isMatchPrevPress(press)) {
        press = hotkeyConf.keyBindings[1];
      }

      const isMatch = this.isMatch(event, press);
      if (!isMatch) { return false }

      matchResult = hotkeyConf;

      const stopPropagation = opts.stopPropagation || hotkeyConf.stopPropagation;
      const preventDefault = opts.preventDefault || hotkeyConf.preventDefault;
      stopPropagation && event.stopPropagation();
      preventDefault && event.preventDefault();

      if (press === hotkeyConf.keyBindings[0] && hotkeyConf.keyBindings.length > 1) {
        this.prevPress = {
          combinationKeys: combinationKeysMonitor.getCombinationKeys(),
          code: event.code,
          key: event.key,
          keyCode: event.keyCode,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey
        };

        clearTimeout(this._prevTimer_);
        this._prevTimer_ = setTimeout(() => { this.prevPress = null; }, 1000);

        return true
      }

      if (hotkeyConf.keyBindings.length > 1 && press !== hotkeyConf.keyBindings[0]) {
        setTimeout(() => { this.prevPress = null; }, 0);
      }

      const args = toArrArgs(hotkeyConf.args);
      let commandFunc = hotkeyConf.command;
      if (target && typeof hotkeyConf.command === 'string') {
        commandFunc = getValByPath(target, hotkeyConf.command);
      }

      if (!(commandFunc instanceof Function) && target) {
        throw new Error(`[hotkeysRunner] command: ${hotkeyConf.command} `)
      }

      if (hotkeyConf.when && conditionHandler instanceof Function) {
        const isMatchCondition = conditionHandler.apply(target, toArrArgs(hotkeyConf.when));
        if (isMatchCondition === true) {
          commandFunc.apply(target, args);
        }
      } else {
        commandFunc.apply(target, args);
      }
    });

    return matchResult
  }

  binding (opts = {}) {
    if (!isObj(opts) || !Array.isArray(opts.hotkeys)) {
      throw new Error('[hotkeysRunner] binding')
    }

    opts.el = opts.el || this.window;
    opts.type = opts.type || 'keydown';
    opts.debug && (this.debug = true);

    this.setHotkeys(opts.hotkeys);

    if (typeof opts.el === 'string') {
      opts.el = document.querySelector(opts.el);
    }

    opts.el.addEventListener(opts.type, (event) => {
      opts.event = event;
      this.run(opts);
    }, true);
  }
}

/* eslint-disable camelcase */

/**
 * @license Copyright 2017 - Chris West - MIT Licensed
 * Prototype to easily set the volume (actual and perceived), loudness,
 * decibels, and gain value.
 * https://cwestblog.com/2017/08/22/web-audio-api-controlling-audio-video-loudness/
 */
function MediaElementAmplifier (mediaElem) {
  this._context = new (window.AudioContext || window.webkitAudioContext)();
  this._source = this._context.createMediaElementSource(this._element = mediaElem);
  this._source.connect(this._gain = this._context.createGain());
  this._gain.connect(this._context.destination);
}
[
  'getContext',
  'getSource',
  'getGain',
  'getElement',
  [
    'getVolume',
    function (opt_getPerceived) {
      return (opt_getPerceived ? this.getLoudness() : 1) * this._element.volume
    }
  ],
  [
    'setVolume',
    function (value, opt_setPerceived) {
      var volume = value / (opt_setPerceived ? this.getLoudness() : 1);
      if (volume > 1) {
        this.setLoudness(this.getLoudness() * volume);
        volume = 1;
      }
      this._element.volume = volume;
    }
  ],
  ['getGainValue', function () { return this._gain.gain.value }],
  ['setGainValue', function (value) { this._gain.gain.value = value; }],
  ['getDecibels', function () { return 20 * Math.log10(this.getGainValue()) }],
  ['setDecibels', function (value) { this.setGainValue(Math.pow(10, value / 20)); }],
  ['getLoudness', function () { return Math.pow(2, this.getDecibels() / 10) }],
  ['setLoudness', function (value) { this.setDecibels(10 * Math.log2(value)); }]
].forEach(function (name, fn) {
  if (typeof name === 'string') {
    fn = function () { return this[name.replace('get', '').toLowerCase()] };
  } else {
    fn = name[1];
    name = name[0];
  }
  MediaElementAmplifier.prototype[name] = fn;
});

const downloadState = new Map();

function download (url, title) {
  const downloadEl = document.createElement('a');
  downloadEl.href = url;
  downloadEl.target = '_blank';
  downloadEl.download = title;
  downloadEl.click();
}

function mediaDownload (mediaEl, title, downloadType) {
  /**
   * https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/currentSrc
   */
  const mediaUrl = mediaEl.src || mediaEl.currentSrc;
  const mediaState = downloadState.get(mediaUrl) || {};

  if (mediaEl && mediaUrl && !mediaUrl.startsWith('blob:')) {
    const mediaInfo = {
      type: mediaEl instanceof HTMLVideoElement ? 'video' : 'audio',
      format: mediaEl instanceof HTMLVideoElement ? 'mp4' : 'mp3'
    };
    let mediaTitle = `${title || mediaEl.getAttribute('data-title') || document.title || Date.now()}_${mediaInfo.type}.${mediaInfo.format}`;

    if (downloadType === 'blob' || mediaEl.duration < 60 * 5) {
      if (mediaState.downloading) {
        if (Date.now() - mediaState.downloading < 1000 * 1) {
          return false
        } else {
          const confirm = original.confirm(i18n.t('mediaDownload.downloading'));
          if (!confirm) {
            return false
          }
        }
      }

      if (mediaState.hasDownload) {
        const confirm = original.confirm(i18n.t('mediaDownload.hasDownload'));
        if (!confirm) {
          return false
        }
      }

      mediaTitle = original.prompt(i18n.t('mediaDownload.confirmTitle'), mediaTitle);
      if (!mediaTitle) { return false }

      if (!mediaTitle.endsWith(mediaInfo.format)) {
        mediaTitle = mediaTitle + '.' + mediaInfo.format;
      }

      let fetchUrl = mediaUrl;
      if (mediaUrl.startsWith('http://') && location.href.startsWith('https://')) {
        fetchUrl = mediaUrl.replace('http://', 'https://');
      }

      mediaState.downloading = Date.now();
      downloadState.set(mediaUrl, mediaState);
      fetch(fetchUrl).then(res => {
        res.blob().then(blob => {
          const blobUrl = window.URL.createObjectURL(blob);
          download(blobUrl, mediaTitle);

          mediaState.hasDownload = true;
          delete mediaState.downloading;
          downloadState.set(mediaUrl, mediaState);
          window.URL.revokeObjectURL(blobUrl);
        });
      }).catch(err => {
        original.console.error('fetch:', err);

        download(mediaUrl, mediaTitle);

        delete mediaState.downloading;
        mediaState.hasDownload = true;
        downloadState.set(mediaUrl, mediaState);
      });
    } else {
      download(mediaUrl, mediaTitle);
    }
  } else if (mediaSource.hasInit()) {
    mediaSource.downloadMediaSource(mediaEl, title);
  } else {
    original.alert(i18n.t('mediaDownload.notSupport'));
  }
}

const device = {
  isMobile: () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  },
  isTablet: () => {
    return /iPad/i.test(navigator.userAgent)
  },
  isDesktop: () => {
    return !device.isMobile() && !device.isTablet()
  },
  isChrome: () => {
    return /Chrome/i.test(navigator.userAgent)
  },
  isFirefox: () => {
    return /Firefox/i.test(navigator.userAgent)
  },
  isSafari: () => {
    return /Safari/i.test(navigator.userAgent)
  },
  isEdge: () => {
    return /Edge/i.test(navigator.userAgent)
  }
};

/**
 */


const h5playerUIProvider = {
  version,
  originalMethods,
  parseHTML,
  observeVisibility,
  isOutOfDocument,
  i18n,
  debug,
  configManager,
  globalFunctional,
  device
};

/**
 */

const windowSandbox = new Proxy({}, {
  get: function (target, key) {
    if (key === 'h5playerUIProvider') {
      return h5playerUIProvider
    }

    if (key === 'HTMLElement') {
      return originalMethods.HTMLElement
    }

    return window[key]
  }
});

/**
 */


const remoteHelperUrl = 'https://h5player.anzz.site/h5p-helper/index.html';

const remoteHelper = {
  init () {
    this.remoteHandler();

    if (isInIframe()) { return false }

    if (!configManager.isGlobalStorageUsable()) { return false }

    const contactRemoteHelperSuccessTime = configManager.getGlobalStorage('contactRemoteHelperSuccessTime');
    let lastContactRemoteHelperTime = configManager.getGlobalStorage('lastContactRemoteHelperTime');
    if (!lastContactRemoteHelperTime) {
      configManager.setGlobalStorage('lastContactRemoteHelperTime', Date.now());
      lastContactRemoteHelperTime = Date.now();
    }

    /**
     */
    const syncInterval = configManager.getGlobalStorage('remoteHelperSyncInterval') || 1000 * 60 * 60 * 12;
    if (contactRemoteHelperSuccessTime && Date.now() - contactRemoteHelperSuccessTime < syncInterval) { return false }
    if (Date.now() - lastContactRemoteHelperTime < 1000 * 60) { return false }

    this.establishRemoteConnection();
  },

  establishRemoteConnection () {
    const lastSucTime = configManager.getGlobalStorage('contactRemoteHelperSuccessTime') || '0';
    const timeStr = new Date().toISOString().split('T')[0].replace(/-/g, '') + new Date().getHours() + '' + new Date().getMinutes();
    const iframe = document.createElement('iframe');
    iframe.src = `${remoteHelperUrl}?t=${timeStr}&v=${version}&lst=${lastSucTime}`;
    iframe.style.cssText = 'width:0; height:0; border:none; visibility:hidden; opacity:0;';
    const insertIframe = () => {
      document.body.appendChild(iframe);
      configManager.setGlobalStorage('lastContactRemoteHelperTime', Date.now());
    };

    if (!document.body || !document.body.appendChild) {
      window.addEventListener('DOMContentLoaded', insertIframe, { once: true });
    } else {
      insertIframe();
    }

    setTimeout(() => { document.body.removeChild(iframe); }, 10000);
  },

  async remoteHandler () {
    if (!location.href.startsWith(remoteHelperUrl) || !configManager.isGlobalStorageUsable()) { return false }

    function syncRemoteData (pageWindow) {
      if (pageWindow.recommendList) {
        configManager.setGlobalStorage('recommendList', pageWindow.recommendList);
      }

      if (pageWindow.remoteVersion) {
        configManager.setGlobalStorage('remoteVersion', pageWindow.remoteVersion);
      }

      if (pageWindow.remoteHelperSyncInterval) {
        configManager.setGlobalStorage('remoteHelperSyncInterval', pageWindow.remoteHelperSyncInterval);
      }

      configManager.setGlobalStorage('contactRemoteHelperSuccessTime', Date.now());
    }

    let checkCount = 0;
    function checkRemoteHelperStatus (pageWindow) {
      if (!Array.isArray(pageWindow.recommendList)) {
        if (checkCount < 30) {
          setTimeout(() => {
            checkCount++;
            checkRemoteHelperStatus(pageWindow);
          }, 200);
        }

        return
      }

      syncRemoteData(pageWindow);
    }

    const pageWindow = await getPageWindow();
    pageWindow && checkRemoteHelperStatus(pageWindow);
  }
};

/**
  */
function isCloudflareChallengePage () {
  const titleCheck = document.title.includes('Just a moment') ||
                     document.title.includes('Cloudflare') ||
                     document.title.includes('challenge');

  const metaRefreshExists = !!document.querySelector('meta[http-equiv="refresh"]');
  const robotsNoindexExists = !!document.querySelector('meta[name="robots"][content*="noindex"]');

  const mainWrapperExists = !!document.querySelector('.main-wrapper[role="main"]');
  const challengeErrorExists = !!document.querySelector('#challenge-error-text');
  const bodyNoJsClass = document.body && document.body.classList ? document.body.classList.contains('no-js') : false;

  const hasCloudflareStyling = document.styleSheets.length > 0 &&
                              (document.documentElement.innerHTML.includes('background-image: url(data:image/svg+xml;base64,') ||
                               document.documentElement.innerHTML.includes('challenge'));


  const metaFeatures = metaRefreshExists || robotsNoindexExists;
  const domFeatures = mainWrapperExists || challengeErrorExists || bodyNoJsClass;

  return (titleCheck && metaFeatures) ||
         (titleCheck && domFeatures) ||
         ((domFeatures && (mainWrapperExists + challengeErrorExists + (bodyNoJsClass ? 1 : 0) >= 2)) && metaFeatures) ||
         (hasCloudflareStyling && (titleCheck || metaFeatures || domFeatures))
}

function registerMouseEvent (h5player) {
  const t = h5player;

  const longPressTime = configManager.get('mouse.longPressTime') || 600;
  let mouseEventTimer = null;
  let hasHandleEvent = false;
  let isPaused = false;
  let oldPlaybackRate = 1;

  document.addEventListener('mousedown', function (event) {
    const player = t.player();

    if (!player || !(player instanceof HTMLVideoElement)) { return }

    isPaused = player.paused;

    if (!isCoordinateInElement(event.clientX, event.clientY, player)) { return }

    const rect = player.getBoundingClientRect();
    if (event.clientY > rect.bottom - 80) { return }

    if (event.button === 0) {
      mouseEventTimer = setTimeout(() => {
        hasHandleEvent = true;
        oldPlaybackRate = t.getPlaybackRate();
        t.unLockPlaybackRate();
        t.setPlaybackRate(3);
        t.lockPlaybackRate(800);

        event.preventDefault();
        event.stopPropagation();
      }, longPressTime);
    }
  }, true);

  document.addEventListener('mouseup', function (event) {
    mouseEventTimer && clearTimeout(mouseEventTimer);

    if (hasHandleEvent) {
      hasHandleEvent = false;
      event.preventDefault();
      event.stopPropagation();

      if (isPaused) {
        t.mediaPlusApi.lockPlay(600);
      } else {
        t.mediaPlusApi.lockPause(600);
      }

      t.unLockPlaybackRate();
      t.setPlaybackRate(oldPlaybackRate);
      t.lockPlaybackRate(800);
    }
  }, true);
}



// const supportMediaTags = ['video', 'bwp-video', 'audio']
const supportMediaTags = ['video', 'bwp-video'];

let TCC = null;
const h5Player = {
  version,
  mediaCore,
  mediaPlusApi: null,
  mediaSource,
  configManager,
  fontSize: 12,
  enable: true,
  globalMode: true,
  playerInstance: null,
  scale: 1,
  translate: {
    x: 0,
    y: 0
  },
  rotate: 0,

  rotateY: 0,
  rotateX: 0,

  defaultTransform: {
    scale: 1,
    translate: {
      x: 0,
      y: 0
    },
    rotate: 0,
    rotateY: 0,
    rotateX: 0
  },

  historyTransform: {},

  playbackRate: configManager.get('media.playbackRate'),
  volume: configManager.get('media.volume'),
  lastPlaybackRate: configManager.get('media.lastPlaybackRate'),
  skipStep: 5,

  mouseObserver: new MouseObserver(),

  disableHotkeysTemporarily () {
    this.__disableHotkeysTemporarily__ = true;
  },
  enableHotkeys () {
    this.__disableHotkeysTemporarily__ = false;
  },
  toggleHotkeys () {
    const confirm = window.confirm(this.__disableHotkeysTemporarily__ ? i18n.t('enableHotkeys') : i18n.t('disableHotkeys'));
    if (confirm) {
      this.__disableHotkeysTemporarily__ = !this.__disableHotkeysTemporarily__;
    }
  },

  debuggerNow () {
    if (debug.isDebugMode()) {
      const script = document.createElement('script');
      script.innerText = 'debugger';
      document.body.appendChild(script);
    }
  },

  disableCurrentInstanceGUI () {
    const t = this;
    const player = t.player();
    if (player && t.UI && t.UI.removePopupWrapByElement) {
      player.__disableGUITemporarily__ = true;
      t.UI.removePopupWrapByElement(player);
    }
  },

  player: function () {
    const t = this;
    let playerInstance = t.playerInstance;

    if (!playerInstance) {
      const mediaList = t.getPlayerList();
      if (mediaList.length) {
        playerInstance = mediaList[mediaList.length - 1];
        t.playerInstance = playerInstance;
        t.initPlayerInstance(mediaList.length === 1);
      }
    }

    if (playerInstance && !t.mediaPlusApi) {
      t.mediaPlusApi = mediaCore.mediaPlus(playerInstance);
    }

    return playerInstance
  },

  isAudioInstance () {
    return isAudioElement(this.player())
  },

  getPlayerList: function () {
    const list = mediaCore.mediaElementList || [];

    function findPlayer (context) {
      supportMediaTags.forEach(tagName => {
        context.querySelectorAll(tagName).forEach(function (player) {
          if (player.tagName.toLowerCase() === 'bwp-video') {
            player.HTMLVideoElement = true;
          }

          if (isMediaElement(player) && !list.includes(player)) {
            list.push(player);
          }
        });
      });
    }

    findPlayer(document);

    if (window._shadowDomList_) {
      window._shadowDomList_.forEach(function (shadowRoot) {
        findPlayer(shadowRoot);
      });
    }

    return list
  },

  getPlayerWrapDom: function () {
    const t = this;
    const player = t.player();
    if (!player) return

    let wrapDom = null;
    const playerBox = player.getBoundingClientRect();
    eachParentNode(player, function (parent) {
      if (parent === document || !parent.getBoundingClientRect) return
      const parentBox = parent.getBoundingClientRect();
      if (parentBox.width && parentBox.height) {
        if (parentBox.width === playerBox.width && parentBox.height === playerBox.height) {
          wrapDom = parent;
        }
      }
    });
    return wrapDom
  },

  async mountToGlobal () {
    try {
      const pageWindow = await getPageWindow();
      if (pageWindow) {
        pageWindow._h5Player = h5Player || 'null';
        if (window.top !== window) {
          pageWindow._h5PlayerInFrame = h5Player || 'null';
        }
        pageWindow._window = window || '';
        debug.log('h5Player');
      }
    } catch (e) {
      debug.error(e);
    }
  },

  /**
   */
  initPlayerInstance (isSingle) {
    const t = this;
    if (!t.playerInstance) return

    const player = t.playerInstance;

    t.mediaPlusApi = mediaCore.mediaPlus(player);

    t.initPlaybackRate();
    t.isFoucs();
    t.proxyPlayerInstance(player);

    t.unLockPlaybackRate();
    t.setPlaybackRate();
    t.lockPlaybackRate(1000);

    player._fullScreen_ = new FullScreen(player);
    player._fullPageScreen_ = new FullScreen(player, true);

    t.registerHotkeysRunner();

    if (!player._hasCanplayEvent_) {
      player.addEventListener('canplay', function (event) {
        t.initAutoPlay(player);
      });
      player._hasCanplayEvent_ = true;
    }

    if (!player._hasPlayerInitEvent_) {
      let setPlaybackRateOnPlayingCount = 0;
      player.addEventListener('playing', function (event) {
        t.unLockPlaybackRate();
        t.setPlaybackRate(null, true);
        t.lockPlaybackRate(1000);

        if (configManager.get('enhance.blockSetVolume') === true && event.target.muted === false) {
          t.setVolume(configManager.getGlobalStorage('media.volume'), true);
        }

        if (configManager.get('enhance.blockSetCurrentTime') === true) {
          t.lockCurrentTime();
        }

        t.setPlayProgress(player);

        if (setPlaybackRateOnPlayingCount === 0) {
          t.unLockPlaybackRate();
          t.setPlaybackRate();
          t.lockPlaybackRate(1000);

          setTimeout(() => {
            t.playProgressRecorder(player);
          }, 2000);
        } else {
          t.unLockPlaybackRate();
          t.setPlaybackRate(null, true);
          t.lockPlaybackRate(1000);
        }
        setPlaybackRateOnPlayingCount += 1;
      });

      player._hasPlayerInitEvent_ = true;
    }

    const taskConf = TCC.getTaskConfig();
    if (taskConf.init) {
      TCC.doTask('init', player);
    }

    const needInitEvent = !player.__registeredInitEvent__;

    needInitEvent && t.mouseObserver.on(player, 'click', function (event, offset, target) {
    });

    needInitEvent && player.addEventListener('enterpictureinpicture', () => {
      monkeyMsg.send('globalPictureInPictureInfo', {
        usePictureInPicture: true
      });
      debug.log('enterpictureinpicture', player);
    });
    needInitEvent && player.addEventListener('leavepictureinpicture', () => {
      t.leavepictureinpictureTime = Date.now();

      monkeyMsg.send('globalPictureInPictureInfo', {
        usePictureInPicture: false
      });
      debug.log('leavepictureinpicture', player);
    });

    // if (debug.isDebugMode()) {}

    function srcRecord (player) {
      const src = player.currentSrc || player.src;
      if (!src) { return }

      player.srcList = player.srcList || [src];
      if (!player.srcList.includes(src)) {
        player.srcList.push(src);
      }
    }

    function updataBufferedTime (player) {
      if (player.buffered.length > 0) {
        const bufferedTime = player.buffered.end(player.buffered.length - 1);
        player.bufferedTime = bufferedTime;
      }

      if (t.autoGotoBufferedTime && player.bufferedTime && t.player() === player && player.bufferedTime < player.duration - 1 && player.currentTime < player.bufferedTime - 1) {
        t.setCurrentTime(player.bufferedTime);
      }
    }

    needInitEvent && player.addEventListener('loadeddata', function () {
      debug.log(`[player][loadeddata] ${player.src} video duration: ${player.duration} video dom:`, player);
      srcRecord(player);
    });
    needInitEvent && player.addEventListener('durationchange', function () {
      debug.log(`[player][durationchange] ${player.duration}`);
      srcRecord(player);
    });

    needInitEvent && player.addEventListener('loadstart', function () {
      debug.log('[player][loadstart]', player.currentSrc, player.src);
      srcRecord(player);
    });

    t.UI && t.UI.popup && t.UI.popup(player, t);

    needInitEvent && player.addEventListener('play', function () {
      t.UI && t.UI.popup && t.UI.popup(player, t);
    });
    needInitEvent && player.addEventListener('pause', function () {
      t.UI && t.UI.popup && t.UI.popup(player, t);
    });
    let lastRegisterUIPopupTime = Date.now();
    let tryRegisterUIPopupCount = 0;
    needInitEvent && player.addEventListener('timeupdate', function () {
      // updataBufferedTime(player)

      if (Date.now() - lastRegisterUIPopupTime > 800 && tryRegisterUIPopupCount < 60) {
        lastRegisterUIPopupTime = Date.now();
        tryRegisterUIPopupCount += 1;
        t.UI && t.UI.popup && t.UI.popup(player, t);
      }

      srcRecord(player);
      mediaSource.connectMediaSourceWithMediaElement(player);
    });

    let lastCleanMediaSourceDataTime = Date.now();
    needInitEvent && player.addEventListener('progress', () => {
      updataBufferedTime(player);
      mediaSource.connectMediaSourceWithMediaElement(player);

      if (Date.now() - lastCleanMediaSourceDataTime > 1000 * 10) {
        lastCleanMediaSourceDataTime = Date.now();
        mediaSource.cleanMediaSourceData();
      }
    });

    needInitEvent && player.addEventListener('durationchange', function () {
      lastRegisterUIPopupTime = Date.now();
      tryRegisterUIPopupCount = 0;
      t.UI && t.UI.popup && t.UI.popup(player, t);
    });

    player.__registeredInitEvent__ = true;
  },

  registerHotkeysRunner () {
    if (!this.hotkeysRunner) {
      this.hotkeysRunner = new HotkeysRunner(configManager.get('hotkeys'));

      if (isInIframe() && !isInCrossOriginFrame()) {
        this.hotkeysRunner.setCombinationKeysMonitor(window.top);
      }
    }
  },

  isLeavepictureinpictureAwhile () {
    const t = this;
    return t.leavepictureinpictureTime && (Date.now() - t.leavepictureinpictureTime < 1000 * 10)
  },

  /**
   * @param player
   */
  proxyPlayerInstance (player) {
    if (!player) return

    const proxyList = [
      'play',
      'pause'
    ];

    proxyList.forEach(key => {
      const originKey = 'origin_' + key;
      if (Reflect.has(player, key) && !Reflect.has(player, originKey)) {
        player[originKey] = player[key];
        const proxy = new Proxy(player[key], {
          apply (target, ctx, args) {

            const hangUpInfo = player._hangUpInfo_ || {};
            const hangUpDetail = hangUpInfo[key] || hangUpInfo['hangUp_' + key];
            const needHangUp = hangUpDetail && hangUpDetail.timeout >= Date.now();
            if (needHangUp) {
              debug.log(key + '');
              return false
            }

            return target.apply(ctx || player, args)
          }
        });

        player[key] = proxy;
      }
    });

    if (!player._hangUp_) {
      player._hangUpInfo_ = {};
      /**
       * @private
       */
      player._hangUp_ = function (name, timeout) {
        timeout = Number(timeout) || 200;
        // debug.log('_hangUp_', name, timeout)
        player._hangUpInfo_[name] = {
          timeout: Date.now() + timeout
        };
      };

      player._unHangUp_ = function (name) {
        if (player._hangUpInfo_ && player._hangUpInfo_[name]) {
          player._hangUpInfo_[name].timeout = Date.now() - 1;
        }
      };
    }
  },

  /**
   */
  initAutoPlay: function (p) {
    const t = this;
    const player = p || t.player();
    const taskConf = TCC.getTaskConfig();

    if (taskConf.autoPlay) {
      if (configManager.getLocalStorage('media.autoPlay') === null) {
        configManager.setLocalStorage('media.autoPlay', true);
      }

      addMenu({
        title: () => configManager.getLocalStorage('media.autoPlay') ? i18n.t('disableInitAutoPlay') : i18n.t('enableInitAutoPlay'),
        fn: () => {
          const confirm = window.confirm(configManager.getLocalStorage('media.autoPlay') ? i18n.t('disableInitAutoPlay') : i18n.t('enableInitAutoPlay'));
          if (confirm) {
            const autoPlay = configManager.getLocalStorage('media.autoPlay');
            if (autoPlay === null) {
              alert(i18n.t('configFail'));
            } else {
              configManager.setLocalStorage('media.autoPlay', !autoPlay);
            }
          }
        }
      });
    }

    if (!configManager.get('media.autoPlay') || (!p && t.hasInitAutoPlay) || !player || (p && p !== t.player()) || document.hidden) {
      return false
    }

    /**
     */
    if (!isInViewPort(player) || isInIframe()) {
      return false
    }

    if (!taskConf.autoPlay) {
      return false
    }

    t.hasInitAutoPlay = true;

    if (player && taskConf.autoPlay && player.paused) {
      TCC.doTask('autoPlay');
      if (player.paused) {
        if (!player._initAutoPlayCount_) {
          player._initAutoPlayCount_ = 1;
        }
        player._initAutoPlayCount_ += 1;
        if (player._initAutoPlayCount_ >= 10) {
          return false
        }
        setTimeout(function () {
          t.initAutoPlay(player);
        }, 200);
      }
    }
  },

  printPlayerInfo (p) {
    const t = this;
    const player = p || t.player();

    const info = {
      curPlayer: player,
      srcList: player.srcList,
      h5player: t,
      h5playerUI: t.UI,
      mediaSource,
      window
    };

    if (t.UI && t.UI.findPopupWrapWithElement) {
      info.curlPopupWrap = t.UI.findPopupWrapWithElement(player);
      info.allPopupWrap = t.UI.getAllPopupWrapElement();
    }

    debug.info('[playerInfo]', info);
  },

  setFullScreen () {
    const player = this.player();
    const isDo = TCC.doTask('fullScreen');
    if (!isDo && player && player._fullScreen_) {
      player._fullScreen_.toggle();
    }
  },

  setWebFullScreen: function () {
    const t = this;
    const player = t.player();
    const isDo = TCC.doTask('webFullScreen');
    if (!isDo && player && player._fullPageScreen_) {
      player._fullPageScreen_.toggle();
    }
  },

  initPlaybackRate () {
    const t = this;
    t.playbackRate = t.getPlaybackRate();
  },

  playbackRateInfo: {
    lockTimeout: Date.now() - 1,
    time: Date.now(),
    value: -1
  },

  getPlaybackRate () {
    let playbackRate = configManager.get('media.playbackRate') || this.playbackRate;
    if (isInIframe()) {
      const globalPlaybackRate = configManager.getGlobalStorage('media.playbackRate');
      if (globalPlaybackRate) {
        playbackRate = globalPlaybackRate;
      }
    }
    return Number(Number(playbackRate).toFixed(1))
  },

  lockPlaybackRate: function (timeout = 200) {
    if (this.mediaPlusApi) {
      if (configManager.get('enhance.blockSetPlaybackRate') === true) {
        timeout = 1000 * 60 * 60 * 24 * 365;
      }

      this.mediaPlusApi.lockPlaybackRate(timeout);
      return true
    }

    this.playbackRateInfo.lockTimeout = Date.now() + timeout;
  },

  unLockPlaybackRate: function () {
    if (this.mediaPlusApi) {
      this.mediaPlusApi.unLockPlaybackRate();
      return true
    }

    this.playbackRateInfo.lockTimeout = Date.now() - 1;
  },

  isLockPlaybackRate: function () {
    if (this.mediaPlusApi) {
      return this.mediaPlusApi.isLockPlaybackRate()
    }

    return Date.now() - this.playbackRateInfo.lockTimeout < 0
  },

  fixPlaybackRate: function (oldPlaybackRate) {
    const t = this;
    const curPlaybackRate = t.getPlaybackRate();

    if (Math.abs(curPlaybackRate - oldPlaybackRate) > 1) {
      t.setCurrentTimeUp(0.1, true);
    }
  },

  setPlaybackRate: function (num, notips, duplicate, skipLock) {
    const t = this;
    const player = t.player();

    if (!skipLock && t.isLockPlaybackRate()) {
      debug.info('');
      return false
    }

    if (TCC.doTask('playbackRate')) {
      // debug.log('[TCC][playbackRate]', 'suc')
      return
    }

    if (!player) return

    const oldPlaybackRate = t.getPlaybackRate();

    let curPlaybackRate;
    if (num) {
      num = Number(num);
      if (Number.isNaN(num)) {
        debug.error('h5player: ');
        return false
      }

      if (num <= 0) {
        num = 0.1;
      } else if (num > 16) {
        num = 16;
      }

      num = Number(num.toFixed(1));
      curPlaybackRate = num;
    } else {
      curPlaybackRate = t.getPlaybackRate();
    }

    t.playbackRate = curPlaybackRate;
    if (isInIframe()) {
      configManager.setGlobalStorage('media.playbackRate', curPlaybackRate);
    } else {
      configManager.set('media.playbackRate', curPlaybackRate);
    }

    if (t.mediaPlusApi) {
      t.mediaPlusApi.setPlaybackRate(curPlaybackRate);

      if (!(!num && curPlaybackRate === 1) && !notips) {
        t.tips(i18n.t('tipsMsg.playspeed') + player.playbackRate);
      }

      const mediaList = t.getPlayerList();
      mediaList.forEach(media => {
        if (media !== player) {
          const mediaPlusApi = mediaCore.mediaPlus(media);
          mediaPlusApi && mediaPlusApi.setPlaybackRate(curPlaybackRate);
        }
      });

      t.fixPlaybackRate(oldPlaybackRate);
      return true
    }

    delete player.playbackRate;
    player.playbackRate = curPlaybackRate;

    t.playbackRateInfo.time = Date.now();
    t.playbackRateInfo.value = curPlaybackRate;
    player._setPlaybackRate_ = {
      time: Date.now(),
      value: curPlaybackRate
    };

    try {
      const playbackRateDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate');
      originalMethods.Object.defineProperty.call(Object, player, 'playbackRate', {
        configurable: true,
        get: function () {
          /**
           */
          return curPlaybackRate || playbackRateDescriptor.get.apply(player, arguments)
        },
        set: function (val) {
          if (typeof val !== 'number') {
            return false
          }

          !Number.isInteger(player._blockSetPlaybackRateTips_) && (player._blockSetPlaybackRateTips_ = 0);

          if (TCC.doTask('blockSetPlaybackRate')) {
            player._blockSetPlaybackRateTips_++;
            player._blockSetPlaybackRateTips_ < 3 && debug.info('');
            return false
          }

          if (configManager.get('enhance.blockSetPlaybackRate') === true) {
            player._blockSetPlaybackRateTips_++;
            player._blockSetPlaybackRateTips_ < 3 && debug.info('blockSetPlaybackRate');
            return false
          } else {
            t.setPlaybackRate(val);
          }
        }
      });
    } catch (e) {
      debug.error('playbackRate', e);
    }

    if (!num && curPlaybackRate === 1) {
      return true
    } else {
      !notips && t.tips(i18n.t('tipsMsg.playspeed') + player.playbackRate);
    }

    /**
     */
    if (!duplicate && configManager.get('enhance.blockSetPlaybackRate') === true) {
      clearTimeout(t._setPlaybackRateDuplicate_);
      clearTimeout(t._setPlaybackRateDuplicate2_);
      const duplicatePlaybackRate = () => {
        t.unLockPlaybackRate();
        t.setPlaybackRate(curPlaybackRate, true, true);
        t.lockPlaybackRate(1000);
      };
      t._setPlaybackRateDuplicate_ = setTimeout(duplicatePlaybackRate, 600);
      t._setPlaybackRateDuplicate2_ = setTimeout(duplicatePlaybackRate, 1200);
    }

    t.fixPlaybackRate(oldPlaybackRate);
  },

  /**
   * @param {*} num
   */
  setPlaybackRatePlus: function (num) {
    num = Number(num);
    if (!num || Number.isNaN(num)) {
      return false
    }

    const t = this;
    t.playbackRatePlusInfo = t.playbackRatePlusInfo || {};
    t.playbackRatePlusInfo[num] = t.playbackRatePlusInfo[num] || {
      time: Date.now() - 1000,
      value: num
    };

    if (Date.now() - t.playbackRatePlusInfo[num].time < 300) {
      t.playbackRatePlusInfo[num].value = t.playbackRatePlusInfo[num].value + num;
    } else {
      t.playbackRatePlusInfo[num].value = num;
    }

    t.playbackRatePlusInfo[num].time = Date.now();

    t.unLockPlaybackRate();
    t.setPlaybackRate(t.playbackRatePlusInfo[num].value);
    t.lockPlaybackRate(1000);
  },

  resetPlaybackRate: function (player) {
    const t = this;
    player = player || t.player();

    t.unLockPlaybackRate();

    const oldPlaybackRate = Number(player.playbackRate);
    const playbackRate = oldPlaybackRate === 1 ? t.lastPlaybackRate : 1;
    if (oldPlaybackRate !== 1) {
      t.lastPlaybackRate = oldPlaybackRate;
      configManager.setLocalStorage('media.lastPlaybackRate', oldPlaybackRate);
    }

    t.setPlaybackRate(playbackRate);

    t.lockPlaybackRate(1000);
  },

  setPlaybackRateUp (num) {
    num = numUp(num) || 0.1;
    if (this.player()) {
      this.unLockPlaybackRate();
      this.setPlaybackRate(this.player().playbackRate + num);

      this.lockPlaybackRate(1000);
    }
  },

  setPlaybackRateDown (num) {
    num = numDown(num) || -0.1;
    if (this.player()) {
      this.unLockPlaybackRate();
      this.setPlaybackRate(this.player().playbackRate + num);

      this.lockPlaybackRate(1000);
    }
  },

  /**
   */
  lockCurrentTime: function (timeout = 200) {
    if (this.mediaPlusApi) {
      if (configManager.get('enhance.blockSetCurrentTime') === true) {
        timeout = 1000 * 60 * 60 * 24 * 365;
      }

      this.mediaPlusApi.lockCurrentTime(timeout);
      return true
    }

    const player = this.player();
    if (player) {
      player.currentTimeInfo = player.currentTimeInfo || {};
      player.currentTimeInfo.lockTimeout = Date.now() + timeout;
    }
  },

  unLockCurrentTime: function () {
    if (this.mediaPlusApi) {
      this.mediaPlusApi.unLockCurrentTime();
      return true
    }

    const player = this.player();
    if (player) {
      player.currentTimeInfo = player.currentTimeInfo || {};
      player.currentTimeInfo.lockTimeout = Date.now() - 1;
    }
  },

  isLockCurrentTime: function () {
    if (this.mediaPlusApi) {
      return this.mediaPlusApi.isLockCurrentTime()
    }

    const player = this.player();
    if (player && player.currentTimeInfo && player.currentTimeInfo.lockTimeout) {
      return Date.now() - player.currentTimeInfo.lockTimeout < 0
    } else {
      return false
    }
  },

  setCurrentTime: function (num) {
    if (!num && num !== 0) return
    num = Number(num);
    const _num = Math.abs(Number(num.toFixed(1)));

    const t = this;
    const player = t.player();

    if (t.isLockCurrentTime()) {
      return false
    }

    if (TCC.doTask('currentTime')) {
      // debug.log('[TCC][currentTime]', 'suc')
      return
    }

    if (this.mediaPlusApi) {
      this.mediaPlusApi.setCurrentTime(_num);
      return true
    }

    delete player.currentTime;
    player.currentTime = _num;
    player.currentTimeInfo = player.currentTimeInfo || {};
    player.currentTimeInfo.time = Date.now();
    player.currentTimeInfo.value = _num;

    try {
      const currentTimeDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
      originalMethods.Object.defineProperty.call(Object, player, 'currentTime', {
        configurable: true,
        enumerable: true,
        get: function () {
          return currentTimeDescriptor.get.apply(player, arguments)
        },
        set: function (val) {
          if (typeof val !== 'number' || TCC.doTask('blockSetCurrentTime') || configManager.get('enhance.blockSetCurrentTime') === true) {
            return false
          }

          if (t.isLockCurrentTime()) {
            return false
          }

          player.currentTimeInfo.time = Date.now();
          player.currentTimeInfo.value = val;

          return currentTimeDescriptor.set.apply(player, arguments)
        }
      });
    } catch (e) {
      debug.error('currentTime', e);
    }
  },

  setCurrentTimeUp (num, hideTips) {
    num = Number(numUp(num) || this.skipStep);

    if (TCC.doTask('addCurrentTime')) ; else {
      if (this.player()) {
        this.unLockCurrentTime();
        this.setCurrentTime(this.player().currentTime + num);

        this.lockCurrentTime(500);

        if (!hideTips) {
          this.tips(i18n.t('tipsMsg.forward') + num + i18n.t('tipsMsg.seconds'));
        }
      }
    }
  },

  setCurrentTimeDown (num) {
    num = Number(numDown(num) || -this.skipStep);

    if (TCC.doTask('subtractCurrentTime')) ; else {
      if (this.player()) {
        let currentTime = this.player().currentTime + num;
        if (currentTime < 1) {
          currentTime = 0;
        }

        this.unLockCurrentTime();
        this.setCurrentTime(currentTime);

        this.lockCurrentTime(500);

        this.tips(i18n.t('tipsMsg.backward') + Math.abs(num) + i18n.t('tipsMsg.seconds'));
      }
    }
  },

  volumeInfo: {
    lockTimeout: Date.now() - 1,
    time: Date.now(),
    value: -1
  },

  getVolume: function () {
    let volume = configManager.get('media.volume');
    if (isInIframe() || configManager.get('enhance.blockSetVolume') === true) {
      const globalVolume = configManager.getGlobalStorage('media.volume');
      if (globalVolume !== null) {
        volume = globalVolume;
      }
    }
    return Number(Number(volume).toFixed(2))
  },

  lockVolume: function (timeout = 200) {
    if (this.mediaPlusApi) {
      if (configManager.get('enhance.blockSetVolume') === true) {
        timeout = 1000 * 60 * 60 * 24 * 365;
      }

      this.mediaPlusApi.lockVolume(timeout);
      return true
    }

    this.volumeInfo.lockTimeout = Date.now() + timeout;
  },

  unLockVolume: function () {
    if (this.mediaPlusApi) {
      this.mediaPlusApi.unLockVolume();
      return true
    }

    this.volumeInfo.lockTimeout = Date.now() - 1;
  },

  isLockVolume: function () {
    if (this.mediaPlusApi) {
      return this.mediaPlusApi.isLockVolume()
    }

    return Date.now() - this.volumeInfo.lockTimeout < 0
  },

  setVolume: function (num, notips, outerCall) {
    const t = this;
    const player = t.player();

    if (t.isLockVolume()) {
      return false
    }

    if (!num && num !== 0) {
      num = t.getVolume();
    }

    num = Number(num).toFixed(2);
    if (num < 0) {
      num = 0;
    }

    if (num > 1 && configManager.get('enhance.allowAcousticGain')) {
      num = Math.ceil(num);

      try {
        player._amp_ = player._amp_ || new MediaElementAmplifier(player);
      } catch (e) {
        num = 1;
        debug.error('', e);
      }

      if (num > 6) {
        num = 6;
      }

      if (!player._amp_ || !player._amp_.setLoudness) {
        num = 1;
      }
    } else if (num > 1) {
      num = 1;
    }

    t.volume = num;

    if (num > 1 && player._amp_ && player._amp_.setLoudness) {
      player._amp_.setLoudness(num);

      if (!outerCall) { player.muted = false; }

      !notips && t.tips(i18n.t('tipsMsg.volume') + parseInt(num * 100) + '%');
      return true
    }

    if (isInIframe() || configManager.get('enhance.blockSetVolume') === true) {
      configManager.setGlobalStorage('media.volume', num);
    } else {
      configManager.setLocalStorage('media.volume', num);
    }

    if (t.mediaPlusApi) {
      t.mediaPlusApi.setVolume(num);

      const mediaList = t.getPlayerList();
      mediaList.forEach(media => {
        if (media !== player) {
          const mediaPlusApi = mediaCore.mediaPlus(media);
          mediaPlusApi && mediaPlusApi.setVolume(num);
        }
      });
    } else {
      delete player.volume;
      player.volume = num;
      t.volumeInfo.time = Date.now();
      t.volumeInfo.value = num;

      try {
        const volumeDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
        originalMethods.Object.defineProperty.call(Object, player, 'volume', {
          configurable: true,
          get: function () {
            return volumeDescriptor.get.apply(player, arguments)
          },
          set: function (val) {
            if (typeof val !== 'number' || val < 0) {
              return false
            }

            if (TCC.doTask('blockSetVolume') || configManager.get('enhance.blockSetVolume') === true) {
              return false
            } else {
              t.setVolume(val, false, true);
            }
          }
        });
      } catch (e) {
        debug.error('volume', e);
      }
    }

    if (!outerCall) { player.muted = false; }

    !notips && t.tips(i18n.t('tipsMsg.volume') + parseInt(player.volume * 100) + '%');
  },

  setVolumeUp (num) {
    num = numUp(num) || 0.2;
    const player = this.player();
    if (player) {
      this.unLockVolume();

      if (this.volume > 1 && player._amp_) {
        this.setVolume(this.volume + num);
      } else {
        this.setVolume(player.volume + num);
      }

      this.lockVolume(500);
    }
  },

  setVolumeDown (num) {
    num = numDown(num) || -0.2;
    const player = this.player();
    if (player) {
      this.unLockVolume();

      if (this.volume > 1 && player._amp_) {
        this.setVolume(Math.floor(this.volume + num));
      } else {
        this.setVolume(player.volume + num);
      }

      this.lockVolume(500);
    }
  },

  collectTransformHistoryInfo () {
    const t = this;
    Object.keys(t.defaultTransform).forEach(key => {
      if (key === 'translate') {
        const translate = t.defaultTransform.translate;
        t.historyTransform.translate = t.historyTransform.translate || {};
        Object.keys(translate).forEach(subKey => {
          if (Number(t.translate[subKey]) !== t.defaultTransform.translate[subKey]) {
            t.historyTransform.translate[subKey] = t.translate[subKey];
          }
        });
      } else {
        if (Number(t[key]) !== t.defaultTransform[key]) {
          t.historyTransform[key] = t[key];
        }
      }
    });
  },

  isSameAsDefaultTransform () {
    let result = true;
    const t = this;
    Object.keys(t.defaultTransform).forEach(key => {
      if (isObj$1(t.defaultTransform[key])) {
        Object.keys(t.defaultTransform[key]).forEach(subKey => {
          if (Number(t[key][subKey]) !== t.defaultTransform[key][subKey]) {
            result = false;
          }
        });
      } else {
        if (Number(t[key]) !== t.defaultTransform[key]) {
          result = false;
        }
      }
    });
    return result
  },

  setTransform (notTips) {
    const t = this;
    const player = t.player();
    const scale = t.scale = Number(t.scale).toFixed(2);
    const translate = t.translate;

    const mirror = t.rotateX === 180 ? `rotateX(${t.rotateX}deg)` : (t.rotateY === 180 ? `rotateY(${t.rotateY}deg)` : '');
    player.style.transform = `scale(${scale}) translate(${translate.x}px, ${translate.y}px) rotate(${t.rotate}deg) ${mirror}`;

    let tipsMsg = i18n.t('tipsMsg.videozoom') + `${(scale * 100).toFixed(0)}%`;
    if (translate.x) {
      tipsMsg += ` ${i18n.t('tipsMsg.horizontal')}${t.translate.x}px`;
    }
    if (translate.y) {
      tipsMsg += ` ${i18n.t('tipsMsg.vertical')}${t.translate.y}px`;
    }

    if (notTips === true) ; else {
      t.collectTransformHistoryInfo();
      t.tips(tipsMsg);
    }

    if (!t._transformStateGuard_) {
      t._transformStateGuard_ = setInterval(() => {
        t.setTransform(true);
      }, 300);
    }
  },

  setRotate () {
    const t = this;
    t.rotate += 90;
    if (t.rotate % 360 === 0) t.rotate = 0;
    t.setTransform(true);
    t.tips(i18n.t('tipsMsg.imgrotate') + t.rotate + '°');
  },

  setMirror (vertical = false) {
    const t = this;
    let tipsMsg = '';
    if (vertical) {
      t.rotateX = t.rotateX === 0 ? 180 : 0;
      tipsMsg += ` ${i18n.t('tipsMsg.verticalMirror')} ${t.rotateX}deg`;
    } else {
      t.rotateY = t.rotateY === 0 ? 180 : 0;
      tipsMsg += ` ${i18n.t('tipsMsg.horizontalMirror')} ${t.rotateY}deg`;
    }

    t.setTransform(true);
    t.tips(tipsMsg);
  },

  setScale (num) {
    if (Number.isNaN(this.scale) || Number.isNaN(num)) {
      this.scale = 1;
    } else {
      this.scale = num;
    }

    this.setTransform();
  },

  setScaleUp (num) {
    num = numUp(num) || 0.05;
    this.setScale(Number(this.scale) + num);
  },

  setScaleDown (num) {
    num = numDown(num) || -0.05;
    this.setScale(Number(this.scale) + num);
  },

  setTranslate (x, y) {
    if (typeof x === 'number') {
      this.translate.x = x;
    }

    if (typeof y === 'number') {
      this.translate.y = y;
    }

    this.setTransform();
  },

  setTranslateRight (num) {
    num = numUp(num) || 10;
    this.setTranslate(this.translate.x + num);
  },

  setTranslateLeft (num) {
    num = numDown(num) || -10;
    this.setTranslate(this.translate.x + num);
  },

  setTranslateUp (num) {
    num = numUp(num) || 10;
    this.setTranslate(null, this.translate.y - num);
  },

  setTranslateDown (num) {
    num = numDown(num) || -10;
    this.setTranslate(null, this.translate.y - num);
  },

  resetTransform (notTips) {
    const t = this;

    if (t.isSameAsDefaultTransform() && Object.keys(t.historyTransform).length) {
      Object.keys(t.historyTransform).forEach(key => {
        if (isObj$1(t.historyTransform[key])) {
          Object.keys(t.historyTransform[key]).forEach(subKey => {
            t[key][subKey] = t.historyTransform[key][subKey];
          });
        } else {
          t[key] = t.historyTransform[key];
        }
      });
    } else {
      const defaultTransform = clone(t.defaultTransform);
      Object.keys(defaultTransform).forEach(key => {
        t[key] = defaultTransform[key];
      });
    }

    t.setTransform(notTips);
  },

  /**
   */
  freezeFrame (perFps) {
    perFps = perFps || 1;
    const t = this;
    const player = t.player();

    player.currentTime += Number(perFps / t.fps);

    if (!player.paused) player.pause();

    player._hangUp_ && player._hangUp_('play', 400);

    if (perFps === 1) {
      t.tips(i18n.t('tipsMsg.nextframe'));
    } else if (perFps === -1) {
      t.tips(i18n.t('tipsMsg.previousframe'));
    } else {
      t.tips(i18n.t('tipsMsg.stopframe') + perFps);
    }
  },

  autoGotoBufferedTime: false,
  toggleAutoGotoBufferedTime () {
    const t = this;
    t.autoGotoBufferedTime = !t.autoGotoBufferedTime;
    t.tips(t.autoGotoBufferedTime ? i18n.t('autoGotoBufferedTime') : i18n.t('disableAutoGotoBufferedTime'));
  },

  /**
   */
  togglePictureInPicture () {
    const player = this.player();
    if (window._isPictureInPicture_ && document.pictureInPictureElement) {
      document.exitPictureInPicture().then(() => {
        window._isPictureInPicture_ = null;
      }).catch((e) => {
        window._isPictureInPicture_ = null;
        debug.error('[togglePictureInPicture]', e);
      });
    } else {
      player.requestPictureInPicture && player.requestPictureInPicture().then(() => {
        window._isPictureInPicture_ = true;
      }).catch((e) => {
        window._isPictureInPicture_ = null;
        debug.error('[togglePictureInPicture]', e);
      });
    }
  },

  setNextVideo () {
    const isDo = TCC.doTask('next');
    if (!isDo) {
      debug.log('~');
    }
  },

  switchPlayStatus () {
    const t = this;
    const player = t.player();

    if (TCC.doTask('switchPlayStatus')) {
      // debug.log('[TCC][switchPlayStatus]', 'suc')
      return
    }

    if (player.paused) {
      if (TCC.doTask('play')) ; else {
        if (t.mediaPlusApi) {
          t.mediaPlusApi.lockPause(400);
          t.mediaPlusApi.applyPlay();
        } else {
          if (player._hangUp_ instanceof Function) {
            player._hangUp_('pause', 400);
            player._unHangUp_('play');
          }

          player.play();
        }

        t.tips(i18n.t('tipsMsg.play'));
      }

      TCC.doTask('afterPlay');
    } else {
      if (TCC.doTask('pause')) ; else {
        if (t.mediaPlusApi) {
          t.mediaPlusApi.lockPlay(400);
          t.mediaPlusApi.applyPause();
        } else {
          if (player._hangUp_ instanceof Function) {
            player._hangUp_('play', 400);
            player._unHangUp_('pause');
          }

          player.pause();
        }

        t.tips(i18n.t('tipsMsg.pause'));
      }

      TCC.doTask('afterPause');
    }
  },

  isAllowRestorePlayProgress: function () {
    const allowRestoreVal = configManager.get(`media.allowRestorePlayProgress.${window.location.host}`);
    return allowRestoreVal === null || allowRestoreVal
  },
  switchRestorePlayProgressStatus: function () {
    const t = h5Player;
    let isAllowRestorePlayProgress = t.isAllowRestorePlayProgress();

    if (isInCrossOriginFrame()) {
      isAllowRestorePlayProgress = false;
    } else {
      isAllowRestorePlayProgress = !isAllowRestorePlayProgress;
    }

    configManager.set(`media.allowRestorePlayProgress.${window.location.host}`, isAllowRestorePlayProgress);

    if (isAllowRestorePlayProgress) {
      t.tips(i18n.t('tipsMsg.arpl'));
      t.setPlayProgress(t.player());
    } else {
      t.tips(i18n.t('tipsMsg.drpl'));
    }
  },
  tipsClassName: 'html_player_enhance_tips',

  getTipsContainer: function (videoEl) {
    const t = h5Player;
    const player = videoEl || t.player();
    // const _tispContainer_ = player._tispContainer_  ||  getContainer(player);

    let tispContainer = player.parentNode || player;

    const containerBox = tispContainer.getBoundingClientRect();
    if ((!containerBox.width || !containerBox.height) && tispContainer.parentNode) {
      tispContainer = tispContainer.parentNode;
    }

    return tispContainer
  },
  tips: function (str) {
    const t = h5Player;
    const player = t.player();
    if (!player) {
      debug.log('h5Player Tips:', str);
      return true
    }

    const isAudio = t.isAudioInstance();
    const parentNode = isAudio ? document.body : t.getTipsContainer();

    if (parentNode === player) {
      debug.info('tips', player, str);
      return false
    }

    let backupStyle = '';
    if (!isAudio) {
      const defStyle = parentNode.getAttribute('style') || '';

      backupStyle = parentNode.getAttribute('style-backup') || '';
      if (!backupStyle) {
        let backupSty = defStyle || 'style-backup: none';
        const backupStyObj = inlineStyleToObj(backupSty);

        /**
         */
        if (backupStyObj.opacity === '0') {
          backupStyObj.opacity = '1';
        }
        if (backupStyObj.visibility === 'hidden') {
          backupStyObj.visibility = 'visible';
        }

        backupSty = objToInlineStyle(backupStyObj);

        parentNode.setAttribute('style-backup', backupSty);
        backupStyle = defStyle;
      } else {
        if (defStyle && !defStyle.includes('style-backup')) {
          backupStyle = defStyle;
        }
      }

      const newStyleArr = backupStyle.split(';');

      const oldPosition = parentNode.getAttribute('def-position') || window.getComputedStyle(parentNode).position;
      if (parentNode.getAttribute('def-position') === null) {
        parentNode.setAttribute('def-position', oldPosition || '');
      }
      if (['static', 'inherit', 'initial', 'unset', ''].includes(oldPosition)) {
        newStyleArr.push('position: relative');
      }

      const playerBox = player.getBoundingClientRect();
      const parentNodeBox = parentNode.getBoundingClientRect();
      if (!parentNodeBox.width || !parentNodeBox.height) {
        newStyleArr.push('min-width:' + playerBox.width + 'px');
        newStyleArr.push('min-height:' + playerBox.height + 'px');
      }

      parentNode.setAttribute('style', newStyleArr.join(';'));

      const newPlayerBox = player.getBoundingClientRect();
      if (Math.abs(newPlayerBox.height - playerBox.height) > 50) {
        parentNode.setAttribute('style', backupStyle);
      }
    }

    const tipsSelector = '.' + t.tipsClassName;

    const tipsList = document.querySelectorAll(tipsSelector);
    if (tipsList.length > 1) {
      tipsList.forEach(tipsItem => {
        tipsItem.remove();
      });
    }

    let tipsDom = parentNode.querySelector(tipsSelector);

    if (!tipsDom) {
      t.initTips();
      tipsDom = parentNode.querySelector(tipsSelector);
      if (!tipsDom) {
        debug.log('init h5player tips dom error...');
        return false
      }
    }

    const style = tipsDom.style;
    tipsDom.innerText = str;

    for (let i = 0; i < 3; i++) {
      if (this.on_off[i]) clearTimeout(this.on_off[i]);
    }

    function showTips () {
      style.display = 'block';
      t.on_off[0] = setTimeout(function () {
        style.opacity = 1;
      }, 50);
      t.on_off[1] = setTimeout(function () {
        style.opacity = 0;
        style.display = 'none';
        if (backupStyle) {
          parentNode.setAttribute('style', backupStyle);
        }
      }, 2000);
    }

    if (style.display === 'block') {
      style.display = 'none';
      clearTimeout(this.on_off[3]);
      t.on_off[2] = setTimeout(function () {
        showTips();
      }, 100);
    } else {
      showTips();
    }
  },

  initTips: function () {
    const t = h5Player;
    const isAudio = t.isAudioInstance();
    const parentNode = isAudio ? document.body : t.getTipsContainer();
    if (parentNode.querySelector('.' + t.tipsClassName)) return

    // top: 50%;
    // left: 50%;
    // transform: translate(-50%,-50%);
    let tipsStyle = `
      position: absolute;
      z-index: 999999;
      font-size: ${t.fontSize || 16}px;
      padding: 5px 10px;
      background: rgba(0,0,0,0.4);
      color:white;
      top: 0;
      left: 0;
      transition: all 500ms ease;
      opacity: 0;
      border-bottom-right-radius: 5px;
      display: none;
      -webkit-font-smoothing: subpixel-antialiased;
      font-family: 'microsoft yahei', Verdana, Geneva, sans-serif;
      -webkit-user-select: none;
    `;

    if (isAudio) {
      tipsStyle = `
        position: fixed;
        z-index: 999999;
        font-size: ${t.fontSize || 16}px;
        padding: 5px 10px;
        background: rgba(0,0,0,0.4);
        color:white;
        bottom: 0;
        right: 0;
        transition: all 500ms ease;
        opacity: 0;
        border-top-left-radius: 5px;
        display: none;
        -webkit-font-smoothing: subpixel-antialiased;
        font-family: 'microsoft yahei', Verdana, Geneva, sans-serif;
        -webkit-user-select: none;
      `;
    }

    const tips = document.createElement('div');
    tips.setAttribute('style', tipsStyle);
    tips.setAttribute('class', t.tipsClassName);
    parentNode.appendChild(tips);
  },
  on_off: new Array(3),
  fps: 30,
  filter: {
    key: [1, 1, 1, 0, 0],
    setup: function () {
      let view = 'brightness({0}) contrast({1}) saturate({2}) hue-rotate({3}deg) blur({4}px)';
      for (let i = 0; i < 5; i++) {
        view = view.replace('{' + i + '}', String(this.key[i]));
        this.key[i] = Number(this.key[i]);
      }
      h5Player.player().style.filter = view;
    },
    reset: function () {
      this.key[0] = 1;
      this.key[1] = 1;
      this.key[2] = 1;
      this.key[3] = 0;
      this.key[4] = 0;
      this.setup();
    }
  },

  setFilter (item, num, isDown) {
    if (![0, 1, 2, 3, 4].includes(item) || typeof num !== 'number') {
      debug.error('[setFilter]', '', item, num);
      return false
    }

    if (isDown === true) {
      if (num && num > 0) { num = -num; }
    }

    const nameMap = {
      0: 'brightness',
      1: 'contrast',
      2: 'saturation',
      3: 'hue',
      4: 'blur'
    };

    const t = this;
    t.filter.key[item] += num || 0.1;
    t.filter.key[item] = t.filter.key[item].toFixed(2);

    if (t.filter.key[item] < 0 && nameMap[item] !== 'hue') {
      t.filter.key[item] = 0;
    }

    t.filter.setup();
    t.tips(i18n.t(`tipsMsg.${nameMap[item]}`) + parseInt(t.filter.key[item] * 100) + '%');
  },

  setBrightness (num) {
    this.setFilter(0, num);
  },

  setBrightnessUp (num) {
    this.setFilter(0, num || 0.1);
  },

  setBrightnessDown (num) {
    this.setFilter(0, num || -0.1, true);
  },

  setContrast (num) {
    this.setFilter(1, num);
  },

  setContrastUp (num) {
    this.setFilter(1, num || 0.1);
  },

  setContrastDown (num) {
    this.setFilter(1, num || -0.1, true);
  },

  setSaturation (num) {
    this.setFilter(2, num);
  },

  setSaturationUp (num) {
    this.setFilter(2, num || 0.1);
  },

  setSaturationDown (num) {
    this.setFilter(2, num || -0.1, true);
  },

  setHue (num) {
    this.setFilter(3, num);
  },

  setHueUp (num) {
    this.setFilter(3, num || 1);
  },

  setHueDown (num) {
    this.setFilter(3, num || -1, true);
  },

  setBlur (num) {
    this.setFilter(4, num);
  },

  setBlurUp (num) {
    this.setFilter(4, num || 1);
  },

  setBlurDown (num) {
    this.setFilter(4, num || -1, true);
  },

  resetFilterAndTransform () {
    const t = this;

    t.resetTransform(true);
    t.filter.reset();
    t.tips(i18n.t('tipsMsg.imgattrreset'));
  },

  mediaDownload () {
    if (configManager.get('enhance.allowExperimentFeatures')) {
      debug.warn('[experimentFeatures][mediaDownload]');
      mediaDownload(this.player());
    } else {
      const result = window.confirm(i18n.t('useMediaDownloadTips'));
      if (result) {
        configManager.setGlobalStorage('enhance.allowExperimentFeatures', !configManager.get('enhance.allowExperimentFeatures'));
        window.location.reload();
      }
    }
  },

  capture () {
    const player = this.player();
    videoCapturer.capture(player, true);

    if (!player.paused && !document.pictureInPictureElement && document.visibilityState !== 'visible') {
      this.freezeFrame();
    }
  },

  _isFoucs: false,

  isFoucs: function () {
    const t = h5Player;
    const player = t.player();
    if (!player) return

    player.onmouseenter = function (e) {
      h5Player._isFoucs = true;
    };
    player.onmouseleave = function (e) {
      h5Player._isFoucs = false;
    };
  },
  palyerTrigger: function (player, event) {
    if (!player || !event) return
    const t = h5Player;
    const keyCode = event.keyCode;
    const key = event.key.toLowerCase();

    if (event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
      if (key === 'enter') {
        t.setWebFullScreen();
      }

      if (key === 'p') {
        t.togglePictureInPicture();
      }

      if (key === 's') {
        t.capture();
      }

      if (key === 'r') {
        t.switchRestorePlayProgressStatus();
      }

      if (key === 'm') {
        t.setMirror(true);
      }

      if (key === 'd') {
        t.mediaDownload();
      }

      const allowKeys = ['x', 'c', 'z', 'arrowright', 'arrowleft', 'arrowup', 'arrowdown'];
      if (!allowKeys.includes(key)) return

      t.scale = Number(t.scale);
      switch (key) {
        case 'x':
          t.setScaleDown();
          break
        case 'c':
          t.setScaleUp();
          break
        case 'z':
          t.resetTransform();
          break
        case 'arrowright':
          t.setTranslateRight();
          break
        case 'arrowleft':
          t.setTranslateLeft();
          break
        case 'arrowup':
          t.setTranslateUp();
          break
        case 'arrowdown':
          t.setTranslateDown();
          break
      }

      event.stopPropagation();
      event.preventDefault();
      return true
    }

    if (event.ctrlKey && keyCode === 39) {
      t.setCurrentTimeUp(t.skipStep * 6);
    }
    if (event.ctrlKey && keyCode === 37) {
      t.setCurrentTimeDown(-t.skipStep * 6);
    }

    if (event.ctrlKey && keyCode === 38) {
      t.setVolumeUp(0.2);
    }
    if (event.ctrlKey && keyCode === 40) {
      t.setVolumeDown(-0.2);
    }

    if (event.altKey || event.ctrlKey || event.shiftKey || event.metaKey) return

    if (keyCode === 39) {
      t.setCurrentTimeUp();
    }
    if (keyCode === 37) {
      t.setCurrentTimeDown();
    }

    if (keyCode === 38) {
      t.setVolumeUp(0.05);
    }
    if (keyCode === 40) {
      t.setVolumeDown(-0.05);
    }

    if (keyCode === 32) {
      t.switchPlayStatus();
    }

    if (keyCode === 88) {
      t.setPlaybackRateDown();
    }
    if (keyCode === 67) {
      t.setPlaybackRateUp();
    }
    if (keyCode === 90) {
      t.resetPlaybackRate();
    }

    if ((keyCode >= 49 && keyCode <= 52) || (keyCode >= 97 && keyCode <= 100)) {
      t.setPlaybackRatePlus(event.key);
    }

    if (keyCode === 70) {
      t.freezeFrame(1);
    }
    if (keyCode === 68) {
      t.freezeFrame(-1);
    }

    if (keyCode === 69) {
      t.setBrightnessUp();
    }
    if (keyCode === 87) {
      t.setBrightnessDown();
    }

    if (keyCode === 84) {
      t.setContrastUp();
    }
    if (keyCode === 82) {
      t.setContrastDown();
    }

    if (keyCode === 85) {
      t.setSaturationUp();
    }
    if (keyCode === 89) {
      t.setSaturationDown();
    }

    if (keyCode === 79) {
      t.setHueUp();
    }
    if (keyCode === 73) {
      t.setHueDown();
    }

    if (keyCode === 75) {
      t.setBlurUp();
    }
    if (keyCode === 74) {
      t.setBlurDown();
    }

    if (keyCode === 81) {
      t.resetFilterAndTransform();
    }

    if (keyCode === 83) {
      t.setRotate();
    }

    if (keyCode === 77) {
      t.setMirror();
    }

    if (keyCode === 13) {
      t.setFullScreen();
    }

    if (key === 'n') {
      t.setNextVideo();
    }

    event.stopPropagation();
    event.preventDefault();
    return true
  },

  runCustomShortcuts: function (player, event) {
    if (!player || !event) return
    const key = event.key.toLowerCase();
    const taskConf = TCC.getTaskConfig();
    const confIsCorrect = isObj$1(taskConf.shortcuts) &&
      Array.isArray(taskConf.shortcuts.register) &&
      taskConf.shortcuts.callback instanceof Function;

    function isRegister () {
      const list = taskConf.shortcuts.register;

      const combineKey = [];
      if (event.ctrlKey) {
        combineKey.push('ctrl');
      }
      if (event.shiftKey) {
        combineKey.push('shift');
      }
      if (event.altKey) {
        combineKey.push('alt');
      }
      if (event.metaKey) {
        combineKey.push('command');
      }

      combineKey.push(key);

      let hasReg = false;
      list.forEach((shortcut) => {
        const regKey = shortcut.split('+');
        if (combineKey.length === regKey.length) {
          let allMatch = true;
          regKey.forEach((key) => {
            if (!combineKey.includes(key)) {
              allMatch = false;
            }
          });
          if (allMatch) {
            hasReg = true;
          }
        }
      });

      return hasReg
    }

    if (confIsCorrect && isRegister()) {
      const isDo = TCC.doTask('shortcuts', {
        event,
        player,
        h5Player
      });

      if (isDo) {
        event.stopPropagation();
        event.preventDefault();
      }

      return isDo
    } else {
      return false
    }
  },

  keydownEvent: function (event) {
    const t = h5Player;
    const keyCode = event.keyCode;
    // const key = event.key.toLowerCase()
    const player = t.player();

    const target = event.composedPath ? event.composedPath()[0] || event.target : event.target;
    if (t.__disableHotkeysTemporarily__ || isEditableTarget(target)) return

    monkeyMsg.send('globalKeydownEvent', event, 0);

    if (!player) {
      if (t.hasCrossOriginVideoDetected) {
        if (!configManager.get('enhance.allowCrossOriginControl')) {
          return false
        }

        /**
         */
        if (t.hotkeysRunner && t.hotkeysRunner.run) {
          t.hotkeysRunner.run({
            event,
            stopPropagation: true,
            preventDefault: true
          });
        } else {
          t.registerHotkeysRunner();
          event.stopPropagation();
          event.preventDefault();
        }

      }

      return false
    }

    if (event.ctrlKey && keyCode === 32) {
      t.enable = !t.enable;
      if (t.enable) {
        t.tips(i18n.t('tipsMsg.onplugin'));
      } else {
        t.tips(i18n.t('tipsMsg.offplugin'));
      }
    }

    if (!t.enable) {
      debug.log('h5Player ~');
      return false
    }

    if (event.ctrlKey && keyCode === 220) {
      t.globalMode = !t.globalMode;
      if (t.globalMode) {
        t.tips(i18n.t('tipsMsg.globalmode') + ' ON');
      } else {
        t.tips(i18n.t('tipsMsg.globalmode') + ' OFF');
      }
    }

    if (!t.globalMode && !t._isFoucs) return

    if (t.runCustomShortcuts(player, event) === true) return

    if (t.hotkeysRunner && t.hotkeysRunner.run) {
      const matchResult = t.hotkeysRunner.run({
        event,
        target: t,
        stopPropagation: true,
        preventDefault: true,
        conditionHandler (condition) {
          if (condition) {
            return true
          }
        }
      });

      if (matchResult) {
        debug.info('[hotkeysRunner][matchResult]', matchResult);
        return true
      }
    } else {
      if (!isRegisterKey(event)) { return false }

      t.palyerTrigger(player, event);
    }
  },

  /**
   */
  getPlayProgress: function (player) {
    const progressMap = configManager.get('media.progress') || {};

    if (!player) {
      return progressMap
    } else {
      const keyName = window.location.href + player.duration;
      if (progressMap[keyName]) {
        if (Number.isNaN(Number(player.duration)) || Number(progressMap[keyName].duration) !== Number(player.duration)) {
          return player.currentTime
        } else {
          return progressMap[keyName].progress
        }
      } else {
        return player.currentTime
      }
    }
  },
  playProgressRecorder: function (player) {
    const t = h5Player;
    clearTimeout(player._playProgressTimer_);
    function recorder (player) {
      player._playProgressTimer_ = setTimeout(function () {
        const isToShort = !player.duration || Number.isNaN(Number(player.duration)) || player.duration < 120;
        const isLeave = document.visibilityState !== 'visible' && player.paused;

        if (!t.isAllowRestorePlayProgress() || isToShort || isLeave) {
          recorder(player);
          return true
        }

        const progressMap = t.getPlayProgress() || {};
        const list = Object.keys(progressMap);
        const keyName = window.location.href + player.duration;

        /**
         */
        if (!progressMap[keyName]) {
          t._firstProgressRecord_ = keyName;
          t._hasRestorePlayProgress_ = keyName;
        }

        if (list.length > 10) {
          let timeList = [];
          list.forEach(function (keyName) {
            progressMap[keyName] && progressMap[keyName].t && timeList.push(progressMap[keyName].t);
          });
          timeList = quickSort(timeList);
          const timestamp = timeList[0];

          list.forEach(function (keyName) {
            if (progressMap[keyName].t === timestamp) {
              delete progressMap[keyName];
            }
          });
        }

        progressMap[keyName] = {
          progress: player.currentTime,
          duration: player.duration,
          t: new Date().getTime()
        };

        configManager.setLocalStorage('media.progress', progressMap);

        recorder(player);
      }, 1000 * 2);
    }
    recorder(player);
  },

  setPlayProgress: function (player) {
    const t = h5Player;
    if (!player || !player.duration || Number.isNaN(player.duration)) return

    const curTime = Number(t.getPlayProgress(player));

    if (!curTime || Number.isNaN(curTime) || curTime < 10 || curTime >= player.duration) return

    if (Math.abs(curTime - player.currentTime) < 2) {
      return false
    }

    const progressKey = window.location.href + player.duration;
    t._hasRestorePlayProgress_ = t._hasRestorePlayProgress_ || '';

    if (t._hasRestorePlayProgress_ === progressKey || t._firstProgressRecord_ === progressKey) {
      if (t._hasRestorePlayProgress_ === progressKey) {
        t._firstProgressRecord_ = '';
      }
      return false
    }

    if (t.isAllowRestorePlayProgress()) {
      player.currentTime = curTime - 1.5;
      t._hasRestorePlayProgress_ = progressKey;
      t.tips(i18n.t('tipsMsg.playbackrestored'));
    } else {
      t.tips(i18n.t('tipsMsg.playbackrestoreoff'));
    }
  },

  setPlayerInstance (el) {
    if (!el && !el.getBoundingClientRect) {
      return false
    }

    const t = h5Player;

    if (t.player() === el) {
      return false
    }

    if (!t.playerInstance && isMediaElement(el)) {
      t.playerInstance = el;
      t.initPlayerInstance(false);
      return true
    }

    if (isVideoElement(el)) {
      const elParentNode = t.getTipsContainer(el);
      const elInfo = el.getBoundingClientRect();
      const parentElInfo = elParentNode && elParentNode.getBoundingClientRect();
      if (elInfo && elInfo.width > 200 && parentElInfo && parentElInfo.width > 200) {
        t.playerInstance = el;
        t.initPlayerInstance(false);
      }
    } else if (isAudioElement(el)) {
      if (isAudioElement(t.playerInstance) || (isVideoElement(t.playerInstance) && !t.playerInstance.isConnected)) {
        t.playerInstance = el;
        t.initPlayerInstance(false);
      }
    }
  },

  /**
   * https://developer.mozilla.org/zh-CN/docs/Web/API/Intersection_Observer_API
   */
  intersectionObserver: new IntersectionObserver(function (entries, observer) {
    const t = h5Player;
    // debug.log('[intersectionObserver]', entries)

    let tmpIntersectionRatio = 0;
    entries.forEach(entrie => {
      entrie.target._intersectionInfo_ = entrie;

      if (entrie.intersectionRatio > tmpIntersectionRatio && entrie.intersectionRatio > 0.4) {
        tmpIntersectionRatio = entrie.intersectionRatio;

        const oldPlayer = t.player();
        if (oldPlayer && oldPlayer._intersectionInfo_ && tmpIntersectionRatio < oldPlayer._intersectionInfo_.intersectionRatio) {
          return
        }

        const toggleResult = t.setPlayerInstance(entrie.target);
        toggleResult && debug.log('[intersectionObserver] ', entrie);
      }
    });
  }, {
    threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]
  }),

  /**
   * @param callback
   */
  detecH5Player: function () {
    const t = this;
    const playerList = t.getPlayerList();

    if (playerList.length) {

      if (playerList.length === 1) {
        t.playerInstance = playerList[0];
        t.initPlayerInstance(true);
      }

      playerList.forEach(function (player) {
        if (!player._hasMouseRedirectEvent_) {
          player.addEventListener('mouseenter', function (event) {
            t.setPlayerInstance(event.target);
          });
          player._hasMouseRedirectEvent_ = true;
        }

        if (!player._hasPlayingRedirectEvent_) {
          player.addEventListener('playing', function (event) {
            const media = event.target;

            if (media.duration && media.duration < 8) {
              return false
            }

            t.setPlayerInstance(media);
          });
          player._hasPlayingRedirectEvent_ = true;
        }

        if (!player._hasIntersectionObserver_) {
          t.intersectionObserver.observe(player);
          player._hasIntersectionObserver_ = true;
        }
      });

      if (isInCrossOriginFrame()) {
        monkeyMsg.send('videoDetected', {
          src: t.playerInstance.src
        });
      }

      registerH5playerMenus(h5Player);
    }
  },

  bindFakeEvent () {
    const t = this;
    if (t._hasBindFakeEvent_) return

    let triggerFakeEvent = function (name, oldVal, newVal, remote) {
      const player = t.player();
      if (player && !t.__disableHotkeysTemporarily__) {
        const fakeEvent = newVal.data;
        fakeEvent.stopPropagation = () => { };
        fakeEvent.preventDefault = () => { };
        t.palyerTrigger(player, fakeEvent);

        debug.log('Tab/', newVal);
      }
    };

    /**
     */
    if (!crossTabCtl.hasOpenPictureInPicture() && !t.hasCrossOriginVideoDetected) {
      triggerFakeEvent = throttle(triggerFakeEvent, 80);
    }

    monkeyMsg.on('globalKeydownEvent', async (name, oldVal, newVal, remote) => {
      if (remote) {
        if (isInCrossOriginFrame()) {
          /**
           */
          if (document.visibilityState === 'visible' && newVal.originTab) {
            triggerFakeEvent(name, oldVal, newVal, remote);
          }
        } else if (crossTabCtl.hasOpenPictureInPicture()) {
          if (!newVal.originTab && (document.pictureInPictureElement || t.isLeavepictureinpictureAwhile())) {
            triggerFakeEvent(name, oldVal, newVal, remote);
          }
        }
      }
    });

    t._hasBindFakeEvent_ = true;
  },

  bindEvent: function () {
    const t = this;
    if (t._hasBindEvent_) return

    document.removeEventListener('keydown', t.keydownEvent);
    document.addEventListener('keydown', t.keydownEvent, true);

    if (isInIframe() && !isInCrossOriginFrame()) {
      window.top.document.removeEventListener('keydown', t.keydownEvent);
      window.top.document.addEventListener('keydown', t.keydownEvent, true);
    }

    t._hasBindEvent_ = true;
  },

  setCustomConfiguration (config, tag = 'Default') {
    if (!config) return false

    const configuration = configManager.mergeDefConf(config.customConfiguration);
    const taskConf = mergeTaskConf(config.customTaskControlCenter);
    if (TCC && TCC.setTaskConf) {
      TCC.setTaskConf(taskConf);
    }

    h5Player.hasSetCustomConfiguration = tag;
    debug.info(`[CustomConfiguration][${tag}]`, configuration, taskConf);
  },

  mergeExternalConfiguration (config, tag = 'Default') {
    if (!config || !configManager.getGlobalStorage('enhance.allowExternalCustomConfiguration')) return false
    h5Player.setCustomConfiguration(config, 'External');
    h5Player.hasExternalCustomConfiguration = tag;
  },

  init: function (global) {
    const t = this;

    if (window.unsafeWindow && window.unsafeWindow.__h5PlayerCustomConfiguration__) {
      !t.hasExternalCustomConfiguration && t.mergeExternalConfiguration(window.unsafeWindow.__h5PlayerCustomConfiguration__);
    }

    if (TCC && TCC.doTask('disable') === true) {
      debug.info(`[TCC][disable][${location.host}] `);
      return true
    }

    if (!global) {
      t.detecH5Player();
      return true
    }

    if (configManager.get('debug') === true) {
      window._debugMode_ = true;
      t.mountToGlobal();
    }

    setFakeUA();

    TCC = h5PlayerTccInit(t);

    if (configManager.get('enableHotkeys') !== false) {
      t.bindEvent();
      t.bindFakeEvent();
    } else {
      debug.warn('');
    }

    monkeyMsg.on('videoDetected', async (name, oldVal, newVal, remote) => {
      if (newVal.originTab) {
        t.hasCrossOriginVideoDetected = true;
      }

      debug.log('[hasCrossOriginVideoDetected]', t, name, oldVal, newVal, remote);
    });

    document.addEventListener('visibilitychange', function () {
      h5Player.initAutoPlay();
    });

    if (window.unsafeWindow && configManager.getGlobalStorage('enhance.allowExternalCustomConfiguration')) {
      window.unsafeWindow.__setH5PlayerCustomConfiguration__ = t.mergeExternalConfiguration;
    }
  }
};

async function h5PlayerInit () {
  try {
    if (isCloudflareChallengePage()) {
      console.warn('cloudflareh5player', location.href);
      return false
    }
  } catch (e) {
    debug.error(e);
  }

  const isEnabled = configManager.get('enable');
  const blackUrlList = configManager.get('blacklist.urls') || [];
  const blackDomainList = configManager.get('blacklist.domains') || [];
  const isInBlackList = blackUrlList.includes(location.href) || blackDomainList.includes(location.host);

  if (isInBlackList) {
    console.warn(`[h5player][config][blacklist][${location.href}] \nh5playerblacklist`);
  }

  try {
    if (isEnabled && !isInBlackList) {
      mediaCore.init(function (mediaElement) {
        h5Player.init();
      });

      if (configManager.get('enhance.allowExperimentFeatures') && configManager.get('download.enable')) {
        mediaSource.init();
        debug.warn(`[experimentFeatures][warning] ${i18n.t('experimentFeaturesWarning')}`);
        debug.warn('[experimentFeatures][mediaSource][activated]');
      }

      hackDefineProperty();

      hackAttachShadow();

      proxyHTMLMediaElementEvent();
      // hackEventListener()
    }
  } catch (e) {
    console.error('h5player hack error', e);
  }

  menuRegister();

  if (!isEnabled || isInBlackList) {
    debug.warn(`[config][disable][${location.host}] `);
    return false
  }

  try {
    h5Player.init(true);

    supportMediaTags.forEach(tagName => {
      ready(tagName, function () {
        h5Player.init();
      });
    });

    document.addEventListener('addShadowRoot', function (e) {
      const shadowRoot = e.detail.shadowRoot;
      supportMediaTags.forEach(tagName => {
        ready(tagName, function (element) {
          h5Player.init();
        }, shadowRoot);
      });
    });

    crossTabCtl.init();

    if (isInIframe()) {
      debug.log('h5Player init suc, in iframe:');
    } else {
      debug.log('h5Player init suc');
    }

    if (isInCrossOriginFrame()) {
      debug.log('iframeh5Player', window.location.href);
    }

    if (configManager.get('mouse.enable')) {
      registerMouseEvent(h5Player);
    }
  } catch (e) {
    debug.error('h5Player init fail', e);
  }


  /**
   */
  try {
    configManager.get('ui.enable') !== false && remoteHelper.init();
  } catch (e) {
    debug.error('[remoteHelper.init]', e);
  }

  // console.clear = () => {}
}

function init (retryCount = 0) {
  if (!window.document || !window.document.documentElement) {
    setTimeout(() => {
      if (retryCount < 200) {
        init(retryCount + 1);
      } else {
        console.error('[h5player message:]', 'not documentElement detected!', window);
      }
    }, 10);

    return false
  } else if (retryCount > 0) {
    console.warn('[h5player message:]', 'documentElement detected!', retryCount, window);
  }

  h5PlayerInit();
}

/**
 */
let initTryCount = 0;
try {
  init(0);
} catch (e) {
  setTimeout(() => {
    if (initTryCount < 200) {
      initTryCount++;
      init(0);
      console.error('[h5player message:]', 'init error', initTryCount, e);
    }
  }, 10);
}
