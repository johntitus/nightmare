var debug = require('debug')('nightmare');
var fs = require('fs');

/**
 * Use a `plugin` function.
 *
 * We need to insert the plugin's functions at the beginning of the queue
 * and then replace all the later functions at the end.
 *
 * @param {Function} plugin
 * @param {Function} done
 * @return {Nightmare}
 */

exports.use = function(plugin, done){
  debug('.use()-ing a plugin');
  var cache = this.queue;
  this.queue = [];
  plugin(this);
  var self = this;
  this.queue = this.queue.concat(cache);
  done();
};

/**
 * Go to a new url.
 *
 * @param {String} url
 * @param {Function} done
 */

exports.goto = function(url, done) {
  debug('.goto() url: ' + url);
  this.page.open(url, function(status) {
    debug('.goto() page loaded: ' + status);
    setTimeout(done, 500);
  });
};

/**
 * Go back.
 *
 */

exports.back = function(done) {
  debug('.back()');
  this.page.goBack();
  done();
};

/**
 * Go forward.
 *
 * @param {Function} done
 */

exports.forward = function(done) {
  debug('.forward()');
  this.page.goForward();
  done();
}

/**
 * Refresh the page.
 *
 * @param {Function} done
 */

exports.refresh = function(done) {
  debug('.refresh()-ing the page');
  this.page.evaluate(function(selector) {
    document.location.reload(true);
  }, done);
};

/**
 * Get the url of the page.
 *
 * @param {Function} callback
 * @param {Function} done
 */

exports.url = function(callback, done) {
  debug('.url() getting it');
  this.page.evaluate(function() {
    return document.location.href;
  }, function(url) {
    callback(url);
    done();
  });
};

/**
 * Get the title of the page.
 *
 * @param {Function} callback
 * @param {Function} done
 */

exports.title = function(callback, done) {
  debug('.title() getting it');
  this.page.evaluate(function() {
    return document.title;
  }, function(title) {
    callback(title);
    done();
  });
};

/**
 * Determine if a selector is visible on a page.
 *
 * @param {String} selector
 * @param {Function} callback
 * @param {Function} done
 */

exports.visible = function(selector, callback, done) {
  debug('.visible() for ' + selector);
  this.page.evaluate(function(selector) {
    var elem = document.querySelector(selector);
    return (elem.offsetWidth > 0 && elem.offsetHeight > 0);
  }, function(result) {
    callback(result);
    done();
  }, selector);
};


/**
 * Determine if a selector exists on a page.
 *
 * @param {String} selector
 * @param {Function} callback
 * @param {Function} done
 */
 
exports.exists = function(selector, callback, done) {
  debug('.exists() for ' + selector);
  this.page.evaluate(function(selector) {
    return (document.querySelector(selector)!==null);
  }, function(result) {
    callback(result);
    done();
  }, selector);
};

/**
 * Inject a JavaScript or CSS file onto the page
 *
 * @param {String} type
 * @param {String} file
 * @param {Function} done
 */

exports.inject = function(type, file, done){
  debug('.inject()-ing a file');
  var startTag, endTag;
  if ( type !== "js" && type !== "css" ){
    debug('unsupported file type in .inject()');
    done();
  }
  if (type === "js"){
    startTag = "<script>";
    endTag = "</script>";
  } else if (type === "css"){
    startTag = "<style>";
    endTag = "</style>";
  } 
  var self = this;
  this.page.getContent( function(pageContent){
    var injectedContents = fs.readFileSync(file);
    var content = pageContent + startTag + injectedContents + endTag;
    self.page.setContent(content, null, done);
  }); 
 
}

/**
 * Click an element.
 *
 * @param {String} selector
 * @param {Function} done
 */

exports.click = function(selector, done) {
  debug('.click() on ' + selector);
  this.page.evaluate(function(selector) {
    var element = document.querySelector(selector);
    var event = document.createEvent('MouseEvent');
    event.initEvent('click', true, true);
    element.dispatchEvent(event);
  }, done, selector);
};

/**
 * Type into an element.
 *
 * @param {String} selector
 * @param {String} text
 * @param {Function} done
 */

exports.type = function(selector, text, done) {
  debug('.type() %s into %s', text, selector);
  this.page.evaluate(function(selector, text) {
    var element = document.querySelector(selector);
    element.value = text;
  }, done, selector, text);
};

/**
 * Upload a path into a file input.
 *
 * @param {String} selector
 * @param {String} path
 * @param {Function} done
 */

exports.upload = function(selector, path, done) {
  debug('.upload() to ' + selector + ' with ' + path);
  if (fs.existsSync(path)) {
    this.page.uploadFile(selector, path, impatient(done, this.options.timeout));
  } 
  else {
    debug('invalid file path for upload: %s', path);
    done(new Error('File does not exist to upload.'));
  }
};

/**
 * Wait for various states.
 *
 * @param {Null|Number|String|Function} condition
 */

exports.wait = function(/* args */) {
  var page = this.page;
  var args = arguments;
  var done = args[args.length-1];
  var self = this;

  // null
  if (args.length === 1) {
    debug('.wait() for the next page load');
    this.afterNextPageLoad(done);
  }
  else if (args.length === 2) {
    var condition = args[0];
    if (typeof condition === 'number') {
      var ms = condition;
      debug('.wait() for ' + ms + 'ms');
      setTimeout(done, ms);
    }
    else if (typeof condition === 'string') {
      var selector = condition;
      debug('.wait() for the element ' + selector);
      // we lose the clojure when it goes to phantom, so we have to
      // force it with string concatenation and eval
      eval("var elementPresent = function() {"+
      "  var element = document.querySelector('"+selector+"');"+
      "  return (element ? true : false);" +
      "};");
      this.untilOnPage(elementPresent, true, function (present) {
        if (!present) self.onTimeout('timeout elapsed before selector "'+selector+'" became present');
        done(null, present);
      }, selector);
    }
  }
  // wait for on-page fn==value
  else if (args.length > 2) {
    var fn = args[0];
    var value = args[1];
    if (args.length === 3) {
      debug('.wait() for fn==' + value);
      this.untilOnPage(fn, value, function (val) {
        if (val !== value) self.onTimeout('timeout elapsed before fn==='+value);
        done(null, value);
      });
    }
    else if (args.length === 4) {
      var delay = args[2];
      debug('.wait() for fn==' + value + ' with refreshes every ' + delay);
      this.refreshUntilOnPage(fn, value, delay, function (val) {
        if (val !== value) self.onTimeout('timeout elapsed before fn==='+value);
        done(null, value);
      });
    }
  }
};

/**
 * Take a screenshot.
 *
 * @param {String} path
 * @param {Function} done
 */

exports.screenshot = function(path, done) {
  debug('.screenshot() saved to ' + path);
  this.page.render(path, done);
};

/**
 * Run the function on the page.
 *
 * @param {Function} func
 * @param {Function} callback
 * @param {...} args
 */

exports.evaluate = function(func, callback/**, arg1, arg2...*/) {
  // The last argument is the internal completion callback, but
  // "callback" is the external callback provided by the user.
  // We need to wrap them.
  var args = [].slice.call(arguments);
  var external = callback;
  var internal = args[args.length-1];
  var wrapped = function() {
    external.apply(null, arguments);
    internal();
  };
  args[1] = wrapped;
  debug('.evaluate() fn on the page');
  this.page.evaluate.apply(this.page, args);
};

/**
 * Set the viewport.
 *
 * @param {Number} width
 * @param {Number} height
 * @param {Function} done
 */

exports.viewport = function(width, height, done) {
  debug('.viewport() to ' + width + ' x ' + height);
  var viewport = { width: width, height: height };
  this.page.set('viewportSize', viewport, done);
};

/**
 * Handles page events.
 *
 * @param {String} type
 * @param {Function} callback
 * @param {Function} done
 *
 * See readme for event types.
 */
exports.on = function (type, callback, done) {
  // Timeouts are handled at the nightmare level
  if (type === 'timeout') {
    this.onTimeout = callback;
    done();
  }
  // All other events handled natively in phantomjs
  else {
    var pageEvent = 'on' + type.charAt(0).toUpperCase() + type.slice(1);
    this.page.set(pageEvent, callback, done);
  }
}

/*
 * Sets up basic authentication.
 *
 * @param {String} user
 * @param {Function} password
 */

exports.authentication = function(user, password, done) {
  var self = this;
  this.page.get('settings', function(settings){
    settings.userName = user;
    settings.password = password;
    self.page.set('settings', settings, done);
  });
};

/**
 * Set the useragent.
 *
 * @param {String} useragent
 * @param {Function} done
 */

exports.agent =
exports.useragent = function(useragent, done) {
  debug('.useragent() to ' + useragent);
  this.page.set('settings.userAgent', useragent, done);
};

/**
 * Impatiently call the function after a timeout, if it hasn't been called yet.
 *
 * @param {Function} fn
 * @param {Number} timeout
 */

function impatient(fn, timeout) {
  var called = false;
  var wrapper = function() {
    if (!called) fn.apply(null, arguments);
    called = true;
  };
  setTimeout(wrapper, timeout);
  return wrapper;
}
