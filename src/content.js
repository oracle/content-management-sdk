/**
 * Copyright (c) 2017, 2021 Oracle and/or its affiliates.
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
// jshint ignore: start

// Detect whether we're running in a browser or in NodeJS.
// Note that some other environments (e.g. React-Native) are not detected and may not
// work properly.
const isNodeJS = typeof window === 'undefined' && typeof process === 'object';

//
// ------------------------------- Cross-browser Utility functions ---------------------
//
const utils = {
  bind(func, owner) {
    return function (...args) {
      return func.apply(owner, args);
    };
  },
  extend(dest, orig) {
    for (const prop in orig) {
      if (orig.hasOwnProperty(prop)) {
        dest[prop] = orig[prop];
      }
    }
    return dest;
  },
};

//
// ------------------------------- Internal Logger -------------------------------------
//
const logger = (function logger() {
  const theLogger = {
    logLevel: 'none',
    logLevels: ['error', 'warn', 'info', 'debug', 'log'],
  };
  const dontLog = function dontLog(/* message */) {}; // swallow messages - default

  theLogger.updateLogger = function updateLogger(newLogger) {
    if (newLogger) {
      // setup loggers for each logLevel
      for (let i = 0; i < this.logLevels.length; i += 1) {
        const logLevel = theLogger.logLevels[i];
        theLogger[logLevel] = typeof newLogger[logLevel] === 'function'
          ? utils.bind(newLogger[logLevel], newLogger)
          : dontLog;
      }
    }
  };
  theLogger.updateLogger({}); // setup with no logging

  return theLogger;
}());

//
// ------------------------------- Internal Implementation -------------------------------------
//

// RequireJS config support
const requireConfig = {
  requirePaths: {},
  getContentLayoutRequirePath(info) {
    const { contentServer } = info;
    const cacheBuster = typeof info.cacheBuster === 'object'
      ? info.cacheBuster
      : {
        layoutKey: info.cacheBuster,
        systemKey: info.cacheBuster,
      };
    const layoutCacheBuster = cacheBuster.layoutKey
      ? `/${cacheBuster.layoutKey}`
      : '';
    const systemCacheBuster = cacheBuster.systemKey
      ? `/${cacheBuster.systemKey}`
      : '';

    // setup require config for this Content client's layouts if not already created
    if (!this.requirePaths[contentServer]) {
      // generate a unique require path to Content Layouts for this client
      const baseRequirePath = `contentLayoutPath${Math.floor(
        100000000 + Math.random() * 900000000,
      )}`;
      const paths = {};

      // create paths for 'published' and 'draft'
      paths[
        `${baseRequirePath}published`
      ] = `${contentServer}/_compdelivery${layoutCacheBuster}`;
      paths[
        `${baseRequirePath}draft`
      ] = `${contentServer}/_themes/_components${layoutCacheBuster}`;
      paths[
        `${baseRequirePath}system`
      ] = `${contentServer}/_sitescloud${systemCacheBuster}/sitebuilder/contentlayouts`;

      // cache the base requireJS path for re-use with this content server
      this.requirePaths[contentServer] = baseRequirePath;

      // configure require to support these paths
      requirejs.config({
        paths,
      });
    }

    return this.requirePaths[contentServer];
  },
  preloadContentLayout(requireLayout, resolve, reject) {
    // require in the content layout to populate the require cache but don't render the item
    require([requireLayout], (/* ContentLayout */) => {
      // resolve the promise
      resolve();
    }, (err) => {
      // note that can't find the layout and reject
      logger.warn(
        'ContentClient.renderLayout: Unable to render the layout.  Ensure you can access the layout: If running against published content, that the layout has been published. If draft, that you are logged onto the Sites server',
      );
      reject(`Failed to get layout: ${requireLayout} with error: ${err}`);
    });
  },
  renderContentLayout(requireLayout, layoutParams, container, resolve, reject) {
    // require in the render.js for the layout
    require([requireLayout], (ContentLayout) => {
      const renderLayout = new ContentLayout(layoutParams);

      // call render to add the component to the page
      const renderPromise = renderLayout.render(container);
      if (
        typeof renderPromise === 'object'
        && typeof renderPromise.then === 'function'
      ) {
        renderPromise.then(
          (/* status */) => {
            // resolve the passed in Promise
            resolve();
          },
          (errorStatus) => {
            // failed to render, reject the passed in promise
            reject(errorStatus);
          },
        );
      } else {
        // simply resolve the passed in promise
        resolve();
      }
    }, (err) => {
      // note that can't find the layout and reject
      logger.warn(
        'ContentClient.renderLayout: Unable to render the layout.  Ensure you can access the layout: If published, that the layout has been published. If draft, that you are logged onto the Sites server',
      );
      reject(`failed to get layout: ${requireLayout} with error: ${err}`);
    });
  },
};

// Node specific API
class RestAPINode {
  constructor(args) {
    Object.assign(this, args);
  }

  extractServer(contentServerURL) {
    const url = require('url');
    const contentServer = contentServerURL || 'http://localhost';
    const parsedURL = url.parse(contentServer);

    // extract the server part of the URL
    return `${parsedURL.protocol}//${parsedURL.hostname}${
      parsedURL.port ? `:${parsedURL.port}` : ''
    }`;
  }

  async callRestServer(targetURL, restArgs) {
    const self = this;

    logger.debug(
      `_rest.callRestServer: Calling ${restArgs.method} request with:`,
    );
    logger.debug(targetURL);
    logger.debug(restArgs);

    // require in the node REST call dependencies
    const protocolCalls = {
      'http:': require('http'),
      'https:': require('https'),
    };
    let url = null;
    if (isNodeJS) {
      url = require('url');
    }

    const nodePromise = new Promise((resolve, reject) => {
      // parse the URL
      const options = url.parse(targetURL);
      const protocolCall = protocolCalls[options.protocol || 'https:'];
      let restRequest;
      /* jshint node: true */
      const proxyType = options.protocol || 'https:';
      const proxy = proxyType === 'https:'
        ? process.env.oce_https_proxy
        : process.env.oce_http_proxy;

      /* jshint node: false */
      if (proxy) {
        try {
          logger.debug(`Using proxy: ${proxy}`);
          const HttpsProxyAgent = require('https-proxy-agent');
          logger.debug('Loaded proxy agent');
          const agent = new HttpsProxyAgent(proxy);
          logger.debug(`Using proxy: ${proxy} connecting to ${targetURL}`);
          options.agent = agent;
        } catch (e) {
          logger.warn(
            `Could not initialize https-proxy-agent. Is the package installed in your application?. Making direct call to ${targetURL}`,
          );
        }
      }

      // define function to call the consumer's "beforeSend" method if one was defined,
      // to add additional values to the request options
      const beforeSendOK = (currentOptions) => new Promise((bsResolve, bsReject) => {
        try {
          // if the consumer specified a "beforeSend" callback function then call it
          // if the result is a promise then resolve the promise
          if (typeof restArgs.beforeSend === 'function') {
            const beforeSendResult = restArgs.beforeSend(currentOptions);
            if (beforeSendResult && typeof beforeSendResult.then === 'function') {
              return beforeSendResult
                .then(() => bsResolve(beforeSendResult))
                .catch((e) => bsReject({
                  // error in user code, reject the call
                  status: e,
                  statusText: 'Error in beforeSend() callback promise',
                }));
            }
            return bsResolve(beforeSendResult === undefined || beforeSendResult);
          }
          return bsResolve(true);
        } catch (e) {
          // error in user code, reject the call
          return bsReject({
            status: e,
            statusText: 'Error in beforeSend() callback',
          });
        }
      });

      // function to handle request response into JSON
      const requestResponse = function requestResponse(response) {
        let body = '';
        const responseStatus = response.statusCode;

        response.on('data', (chunk) => {
          body += chunk;
        });

        response.on('end', () => {
          if (responseStatus >= 200 && responseStatus < 300) {
            try {
              const jsonResponse = JSON.parse(body);
              resolve(jsonResponse);
            } catch (e) {
              reject({
                error: body,
              });
            }
          } else {
            // return the error response object to be handled by calling function
            reject(response);
          }
        });
      };

      // store the call type in options
      options.method = restArgs.method.toUpperCase() || '';

      if (options.method === 'GET' && targetURL) {
        // handle 'GET' request

        // allow the user to update the "options"
        beforeSendOK(options).then((result) => {
          if (result) {
            restRequest = protocolCall.get(options, requestResponse);
          } else {
            // aborted the call
            logger.debug('Call aborted by beforeSend');
            reject({
              error: 'call aborted by beforeSend()',
            });
          }
        });
      } else if (
        options.method === 'POST'
        && restArgs.noCSRFToken
        && restArgs.postData
      ) {
        // handle 'POST' request

        // setup the JSON body
        const bodyString = JSON.stringify(restArgs.postData);
        options.headers = {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Length': bodyString.length,
        };

        // do http or https get writing the bodyString
        beforeSendOK(options).then((result) => {
          if (result) {
            restRequest = protocolCall.request(options, requestResponse).write(bodyString);
          } else {
            // aborted the call
            logger.debug('Call aborted by beforeSend');
            reject({
              error: 'call aborted by beforeSend()',
            });
          }
        });
      } else {
        // unsupported method
        reject({
          error: `unsupported REST request: ${JSON.stringify(restArgs)}`,
        });
      }

      // set up common handling
      if (restRequest) {
        // handle errors
        restRequest.on('error', (error) => {
          reject({
            error,
          });
        });

        // handle timeout
        restRequest.on('socket', (socket) => {
          socket.setTimeout(restArgs.timeout);
          socket.on('timeout', () => {
            reject({
              error: `request timed out after: ${restArgs.timeout}`,
            });
          });
        });
      } else {
        logger.debug('no restRequest');
      }
    });

    // return the promise
    const response2 = await nodePromise;
    if (typeof self.coerceData === 'function') {
      return self.coerceData(response2);
    }
    return Promise.resolve(response2);
  }
}

// Browser specific API
class RestAPIBrowser {
  constructor(args) {
    Object.assign(this, args);
  }

  extractServer(contentServerURL) {
    // use the server URL if given, or default to the window URL
    const contentServer = contentServerURL || (window.location && window.location.href);
    const parsedURL = document.createElement('a');

    // parse the URL
    parsedURL.href = contentServer;

    // extract the server part of the URL
    return `${parsedURL.protocol}//${parsedURL.hostname}${
      parsedURL.port ? `:${parsedURL.port}` : ''
    }`;
  }

  async callRestServer(targetURL, restArgs) {
    const self = this;

    logger.debug(
      `_rest.callRestServer: Calling ${restArgs.method} request with:`,
    );
    logger.debug(restArgs);

    const xmlHTTPPromise = new Promise((resolve, reject) => {
      // define function to call the consumer's "beforeSend" method if one was defined,
      // to add additional values to the request options
      const beforeSendOK = (currentXHR) => new Promise((bsResolve, bsReject) => {
        try {
          // if the consumer specified a "beforeSend" callback function then call it
          // if the result is a promise then resolve the promise
          if (typeof restArgs.beforeSend === 'function') {
            const beforeSendResult = restArgs.beforeSend(currentXHR);
            if (beforeSendResult && typeof beforeSendResult.then === 'function') {
              return beforeSendResult
                .then(() => bsResolve(beforeSendResult))
                .catch((e) => bsReject({
                  // error in user code, reject the call
                  status: e,
                  statusText: 'Error in beforeSend() callback promise',
                }));
            }
            return bsResolve(beforeSendResult === undefined || beforeSendResult);
          }
          return bsResolve(true);
        } catch (e) {
          // error in user code, reject the call
          return bsReject({
            status: e,
            statusText: 'Error in beforeSend() callback',
          });
        }
      });

      // create the XMLHttpRequest object and parameters
      const xhr = new XMLHttpRequest();
      const xhrParams = {
        method: (restArgs.method && restArgs.method.toUpperCase()) || '',
        url: targetURL,
        timeout: restArgs.timeout,
        headers: {},
      };
      let doRequest = true;

      // add authorization header, if provided
      if (restArgs.authorization) {
        // for /published API calls, only add header if not 'session' or
        // 'anonymous' (e.g. Basic Auth in non-POD environments)
        if (
          restArgs.contentType !== 'published'
          || ['session', 'anonymous'].indexOf(restArgs.authorization) === -1
        ) {
          xhrParams.headers = {
            Authorization: restArgs.authorization,
          };
        }
      }

      // add the individual request parameters
      if (xhrParams.method === 'GET' && xhrParams.url) {
        // 'GET' request
      } else if (
        xhrParams.method === 'POST'
        && xhrParams.url
        && restArgs.noCSRFToken
        && restArgs.postData
      ) {
        // 'POST' request
        xhrParams.headers['Content-Type'] = 'application/json; charset=UTF-8';
        xhrParams.headers['X-Requested-With'] = 'XMLHttpRequest';
        xhrParams.data = restArgs.postData;
      } else if (
        ['POST', 'PUT'].indexOf(xhrParams.method) !== -1
        && xhrParams.url
        && restArgs.postData
      ) {
        // 'POST'/'PUT' request with X-CSRF-Token
        xhrParams.headers['Content-Type'] = 'application/json; charset=UTF-8';
        xhrParams.headers['X-Requested-With'] = 'XMLHttpRequest';
        xhrParams.headers['X-CSRF-Token'] = self.getCSRFToken(xhrParams.url);
        xhrParams.data = restArgs.postData;
      } else if (xhrParams.method === 'DELETE' && xhrParams.url) {
        // 'DELETE' request with X-CSRF-Token
        xhrParams.headers['X-CSRF-Token'] = self.getCSRFToken(xhrParams.url);
      } else {
        logger.error('_rest.callRestServer: invalid arguments:');
        logger.error(restArgs);

        reject({
          status: 400,
          statusText: `Expected to see arguments: { "method": "GET/POST/PUT/DELETE", "url": url } but recieved: ${JSON.stringify(
            restArgs,
          )}`,
        });

        // note that no request to make
        doRequest = false;
      }

      // execute the request
      if (doRequest) {
        // handle the promise actions for the responses
        xhr.onload = function onload() {
          if (this.status >= 200 && this.status < 300) {
            resolve(JSON.parse(xhr.response ? xhr.response : xhr.responseText));
          } else {
            reject({
              status: this.status,
              statusText: xhr.statusText,
            });
          }
        };
        xhr.onerror = function onerror() {
          reject({
            status: this.status,
            statusText: xhr.statusText,
          });
        };
        xhr.ontimeout = function ontimeout() {
          reject({
            status: this.status,
            statusText: xhr.statusText,
          });
        };

        xhr.open(xhrParams.method, xhrParams.url);

        // add in the headers
        for (const header in xhrParams.headers) {
          if (xhrParams.headers.hasOwnProperty(header)) {
            xhr.setRequestHeader(header, xhrParams.headers[header]);
          }
        }

        // VBCS adapts XMLHttpRequest to use fetch but doesn't support timeout.
        // This check silently ignores timeouts if they are not supported.
        const timeoutOverridden = Object.getOwnPropertyDescriptor(
          xhr,
          'timeout',
        );
        if (timeoutOverridden === undefined || timeoutOverridden.writable) {
          xhr.timeout = xhrParams.timeout; // for IE, need to set timeout after open()
        }

        // handle the beforeSend() callback and then make the request
        beforeSendOK(xhr).then((result) => {
          if (result) {
            if (xhrParams.data) {
              xhr.send(JSON.stringify(xhrParams.data));
            } else {
              xhr.send();
            }
          }
        });
      }
    });

    // return the promise
    const response = await xmlHTTPPromise;
    if (typeof self.coerceData === 'function') {
      return self.coerceData(response);
    }
    return Promise.resolve(response);
  }
}

// Content REST API handle '/content' prefix
const ContentAPIConfiguration = {
  contextRoot: '/content',
  defaultVersion: 'v1',
  supportedVersions: [
    {
      semanticVersion: '1.0.0',
      contentVersion: 'v1',
    },
    {
      semanticVersion: '1.1.0',
      contentVersion: 'v1.1',
    },
  ],
  state: {
    published: 'published',
    draft: 'management',
  },
};

class ContentAPI {
  constructor() {
    // Make these objects part of the interface of this class
    if (isNodeJS) {
      this.restAPI = new RestAPINode(ContentAPIConfiguration);
    } else {
      this.restAPI = new RestAPIBrowser(ContentAPIConfiguration);
    }
  }

  extractServer(contentServerURL) {
    return this.restAPI.extractServer(contentServerURL);
  }

  async callRestServer(targetURL, restArgs) {
    return this.restAPI.callRestServer(targetURL, restArgs);
  }

  static getContentVersion(caller, requestedVersion) {
    // get semantic version
    const regEx = /\s*((([<>]?=?)\s*(v)?([0-9]+)(\.([0-9]+))?(\.([0-9]+))?))\s*/g;
    const parsedVersion = regEx.exec(requestedVersion || '0.0.0') || [];
    const semanticVersion = `${parsedVersion[5] || '0'}.${
      parsedVersion[7] || '0'
    }.${parsedVersion[9] || '0'}`;
    // get the Supported Version based on the semantic version
    for (let i = 0; i < ContentAPIConfiguration.supportedVersions.length; i += 1) {
      if (ContentAPIConfiguration.supportedVersions[i].semanticVersion === semanticVersion) {
        return ContentAPIConfiguration.supportedVersions[i].contentVersion;
      }
    }

    // if we got to here, no version match
    // warn user that non-supported version requested
    logger.warn(
      `Content SDK: "${caller}" has unrecognized Content Version: "${requestedVersion}" - defaulting to: version="${
        this.defaultVersion
      }". To avoid this message, use one of the supported versions when creating a content client: ${JSON.stringify(
        this.supportedVersions,
      )}`,
    );

    // return the default version
    return this.defaultVersion;
  }

  getCSRFToken(/* requestURL */) {
    // Required for Management API
    return 'CSRFToken';
  }

  createPrefix(args) {
    // standard prefix is: "http://<server>:<port>/content/[management||publish]/api/[v1|v1.1]"
    return `${args.contentServer + ContentAPIConfiguration.contextRoot}/${
      ContentAPIConfiguration.state[args.contentType]
    }/api/${this.contentVersion}`;
  }

  createSuffix(args) {
    // standard suffix is:
    // {search string}&[access-token|channelToken]={channelToken}&cb={cacheBuster}
    const search = args.search || '';
    const channelToken = args.channelToken
      ? `${this.properties.tokenName}=${args.channelToken}`
      : '';
    const cacheBusterValue = typeof args.cacheBuster === 'object'
      ? args.cacheBuster.contentKey
      : args.cacheBuster;
    const cacheBuster = cacheBusterValue ? `cb=${cacheBusterValue}` : '';
    let suffix = '';

    // add in search
    suffix += search;

    // add in channelToken
    suffix += (suffix && channelToken ? '&' : '') + channelToken;

    // add in cacheBuster
    suffix += (suffix && cacheBuster ? '&' : '') + cacheBuster;

    return suffix;
  }

  // Format the fully qualified REST URL
  // path: section of the URL beyond the standard REST API
  // args:
  //    contentServer: '<protocol>://<host>:<port>' of the content server
  //    contentType: [management|published]
  //    search: search string to add as query string
  //    channelToken: 'channelToken=<channelToken>' to be added
  //    cacheBuster: 'cb=<cacheBuster>' to be added
  formatURL(path, restArgs) {
    const prefix = this.createPrefix(restArgs);
    const suffix = this.createSuffix(restArgs);
    const url = prefix
      + path
      + (suffix ? (path.indexOf('?') === -1 ? '?' : '&') + suffix : '');

    logger.info(url);

    return url;
  }

  resolveGetTypesPath(/* args */) {
    return '/types';
  }

  // args.typeName: restrict aggregate query to specific types
  resolveGetTypePath(args) {
    return `/types/${args.typeName}`;
  }

  isDigitalAsset(id) {
    return (
      /^DigitalAsset_/i.test(id)
      || (id.length === 36 && (/^CONT/.test(id) || /^CORE/.test(id)))
    );
  }

  getRenditionURL(itemGUID, slug, renditionName, restArgs) {
    let url = '';

    if (slug || itemGUID) {
      if (slug || this.isDigitalAsset(itemGUID)) {
        // Content URL
        const { format } = restArgs;
        const { download } = restArgs;
        const cacheBusterValue = typeof restArgs.cacheBuster === 'object'
          ? restArgs.cacheBuster.contentKey
          : restArgs.cacheBuster;
        let joinChar = '?'; // character to use to join query parameters

        // secure and non-secure assets now use the same path
        const digitalAssets = restArgs.secureContent
          ? this.properties.secureAssetURLName
          : this.properties.assetURLName;

        const rendition = renditionName || this.properties.digitalAssetDefault;
        const identifier = itemGUID || `.by.slug/${slug}`;

        url = `${this.createPrefix(
          restArgs,
        )}/${digitalAssets}/${identifier}/${rendition}`;

        // add in any query parameters
        if (cacheBusterValue) {
          url += `${joinChar}cb=${cacheBusterValue}`;
          joinChar = '&';
        }
        if (format) {
          url += `${joinChar}format=${format}`;
          joinChar = '&';
        }
        if (download) {
          url += `${joinChar}download=true`;
          joinChar = '&';
        } else if (download === false) {
          url += `${joinChar}download=false`;
          joinChar = '&';
        }
        if (restArgs.contentType === 'published' && restArgs.channelToken) {
          url += `${joinChar + this.properties.tokenName}=${
            restArgs.channelToken
          }`;
          joinChar = '&';
        }
      } else {
        // Documents URL
        url = `${restArgs.contentServer}/documents/file/${itemGUID}`;
      }
    }

    logger.info(url);
    return url;
  }

  makeQueryParameters(args) {
    const queryParams = utils.extend({}, args);
    const searchParams = {
      postData: {},
      getData: '',
      assetVersion: '',
    };
    let parameters = '';
    const { search } = queryParams;

    // remove Content SDK arguments and old properties we don't want to add as query parameters
    delete queryParams.ids;
    delete queryParams.IDs;
    delete queryParams.id;
    delete queryParams.ID;
    delete queryParams.itemGUID;
    delete queryParams.itemGUIDs;
    delete queryParams.slug;
    delete queryParams.timeout;
    delete queryParams.search;
    delete queryParams.types;
    delete queryParams.beforeSend;
    delete queryParams.contentType;
    delete queryParams.language;

    // define the string to separate each parameter on the URL
    let separator = '';

    // construct the URL query string from the properties passed in
    for (const property in queryParams) {
      if (queryParams.hasOwnProperty(property)) {
        // if it's a valid URL property, include it
        if (property === encodeURI(property)) {
          let propVal = queryParams[property];

          // convert the "orderBy" array property if required
          // CaaS only supports a single orderBy value, so just use the first item in the array
          if (
            property === 'orderBy'
            && Array.isArray(propVal)
            && propVal.length === 1
          ) {
            const order = (propVal[0].order && propVal[0].order.toLowerCase()) || '';
            const orderEntry = order
              ? `:${order === 'des' ? 'desc' : order}`
              : '';

            propVal = propVal[0].name + orderEntry;
          }

          if (property !== 'expand') {
            if (property === 'version') {
              if (propVal !== undefined && propVal) {
                searchParams.assetVersion = propVal;
              }
            } else if (typeof propVal !== 'object') {
              // we're only handling scalar parameters in GET requests
              parameters += `${separator + property}=${encodeURI(propVal)}`;
              separator = '&';
            }
          }
        }
      }
    }

    // add in any old style 'search' properties
    parameters += search ? separator + search : '';

    // note that 'GET' call should be used and pass back the parameters
    searchParams.method = 'GET';
    searchParams.getData = parameters;

    // note if should use aggregate call
    // aggregate calls should be used for "itemDepth" != 0 and "expand" parameters
    searchParams.useAggregate = queryParams.itemDepth || queryParams.expand;

    return searchParams;
  }
}

// Content API v1: Inherit from base with v1 specific overrides
class ContentApiV1Impl extends ContentAPI {
  constructor() {
    super();
    this.contentVersion = 'v1';
    this.properties = {
      tokenName: 'access-token',
      digitalAssetDefault: 'default',
      assetURLName: 'digital-assets',
      secureAssetURLName: 'secure-digital-assets',
    };
  }

  resolveGetItemListPath(args) {
    return `/items${args.useAggregate ? '/aggregate' : ''}${
      args.types ? `?field:type:equals=${args.types}` : ''
    }`;
  }

  resolveGetItemPath(args) {
    return `/items/${args.itemGUID}${args.useAggregate ? '/aggregate' : ''}`;
  }

  resolveSearchPath(/* args */) {
    return '/items/queries';
  }

  resolveGetBulkItemListPath(args) {
    // args.itemGUIDs: array of IDs to add to the URL
    return `/items/bulk${
      args.useAggregate ? '/aggregate' : ''
    }?ids=${args.itemGUIDs.join(',')}`;
  }
}

// Content API v1.1: Inherit from v1 with v1.1 specific overrides
class ContentApiV11Impl extends ContentApiV1Impl {
  constructor(contentVersion) {
    super();
    if (contentVersion) {
      this.requestedContentVersion = contentVersion;
    }
    this.contentVersion = 'v1.1';
    this.properties = {
      tokenName: 'channelToken',
      digitalAssetDefault: 'native',
      assetURLName: 'assets',
      secureAssetURLName: 'assets',
    };
  }

  resolveGetItemListPath(args) {
    let itemListURL = '/items';
    let joinChar = '?';

    // add in query
    if (args.types) {
      itemListURL += `${joinChar}field:type:equals=${args.types}`;
      joinChar = '&';
    }
    // add in aggregate
    if (args.useAggregate) {
      itemListURL += `${joinChar}expand="all"`;
      joinChar = '&';
    }

    return itemListURL;
  }

  resolveGetItemPath(args) {
    const language = args.language
      ? `/variations/language/${args.language}?fields=all`
      : '';
    const nextParam = language ? '&' : '?';
    const aggregate = args.useAggregate
      ? `${nextParam}expand=${args.useAggregate}`
      : '';
    const slug = args.slug ? `.by.slug/${args.slug}` : '';

    // Ignored if language is given to not create an invalid URL
    let versionStr = '';
    if (!language) {
      if (args.assetVersion) {
        versionStr = `/versions/${args.assetVersion}`;
      }
    }

    if (args.itemGUID) {
      // Get Published Item by ID:
      // .../items/{id}
      //
      // Get Published Item by ID for specified language:
      // .../items/{id}/variations/language/{languageValue}
      return `/items/${args.itemGUID}${versionStr}${language}${aggregate}`;
    }
    // Get Published Item by slug:
    // .../items/.by.slug/{slug}
    //
    // Get published item by slug for specified language:
    // .../items/.by.slug/{slug}/variations/language/{languageValue}
    return `/items/${slug}${versionStr}${language}${aggregate}`;
  }

  resolveQueryTaxonomyCategoriesPath(args) {
    return `/taxonomies/${args.taxonomyGUID}/categories`;
  }

  resolveGetTaxonomiesPath(/* args */) {
    return '/taxonomies';
  }

  resolveGetRecommendationPath(args) {
    if (args.id) {
      return `/personalization/recommendationResults/.by.id/${args.id}`;
    }
    return `/personalization/recommendationResults/${args.apiName}`;
  }

  resolveSearchPath(/* args */) {
    return '/items';
  }

  resolveGetBulkItemListPath(args) {
    // args.itemGUIDs: array of IDs to add to the URL
    const idQuery = `(id eq "${args.itemGUIDs.join('" or id eq "')}")`;
    const languageQuery = args.language
      ? `(language eq "${args.language}")`
      : '';

    return `/items?q=${
      languageQuery ? `(${idQuery} and ${languageQuery})` : idQuery
    }`;
  }

  coerceData(response) {
    const self = this;
    return new Promise((resolve /* , reject */) => {
      // if the requested content version is v1, coerce data from v1.1 to v1 format
      if (self.requestedContentVersion === 'v1') {
        if (typeof response.fields === 'object') {
          // coerce single item
          if (!response.data) {
            response.data = response.fields;
          }
        } else if (Array.isArray(response.items)) {
          // coerce array of items
          response.items.forEach((item) => {
            if (typeof item.fields === 'object' && !item.data) {
              item.data = item.fields;
            }
          });
        }
      }

      // resolve with updated data
      return resolve(response);
    });
  }
}

// setup the REST API, content version is handled within the underlying REST call
const restAPIFactory = {
  createRestAPI(contentVersion) {
    const validContentVersion = ContentAPI.getContentVersion(
      'ContentSDK create content client',
      contentVersion,
    );

    if (validContentVersion === 'v1') {
      // only support v1.1 now, so create a v1.1 API and set the requestd content version to v1
      // we will coerce the data on fetch to be in the v1 format
      // ToDo: wait for deprecation and fix up tests that are expecting
      // 'v1' in the URL before making this change
      return new ContentApiV11Impl('v1');
    }
    return new ContentApiV11Impl();
  },
};

//
// ------------------------------- Content Client SDK -------------------------------------
//

/**
 * Client content SDK object to interact with content published in Oracle Content Management:
 * <ul>
 * <li>Read the published content items</li>
 * <li>Render published content using named content layouts</li>
 * </ul>
 * @constructor
 * @alias ContentDeliveryClient
 * @param {object} args - A JavaScript object containing the parameters
 * to create the content delivery client instance.
 * @param {string} [args.contentServer='protocol://host:port'] -
 * URL to the Oracle Content Management instance providing content.
 * The default assumes the current '<i>protocol</i>://<i>host</i>:<i>port</i>'.
 * @param {('v1' | 'v1.1')} [args.contentVersion='v1.1'] -
 * The version of the content delivery REST API to use.
 * @param {string} args.channelToken - The Oracle Content and
 * Experience instance token for accessing published content.
 * @param {string} [args.cacheBuster=''] - The URL parameter used
 * to control whether or not content is fetched from the browser cache.
 * @param {boolean} [args.secureContent=false] - Content is secured and requires sign-in to view.
 * @param {string} [args.authorization] - Authorization header to include in the request.
 * @param {function} [args.beforeSend=undefined] - Callback passing
 * in the xhr (browser) or options (node) object before making the REST call.
 * @param {string} [args.timeout=0] - Timeout for the AJAX calls. Defaults to no timeout.
 * @param {object} args.logger - An object that implements the
 * standard log functions: ['error', 'warn', 'info', 'debug', 'log'].
 * @returns {ContentDeliveryClient}
 */
class ContentDeliveryClientImpl {
  constructor(args) {
    // create the restAPI based on the content version
    this.restAPI = restAPIFactory.createRestAPI(args.contentVersion);

    // update the logger entries
    logger.updateLogger(args.logger);

    // store the given properties
    this.info = {
      accessToken: args.channelToken || args.accessToken,
      channelToken: args.channelToken || args.accessToken,
      cacheBuster: args.cacheBuster,
      beforeSend: args.beforeSend,
      clientType: 'delivery',
      contentServer: this.restAPI.extractServer(args.contentServer),
      contentType: 'published',
      secureContent: args.secureContent || false,
      timeout: args.timeout || 0,
      contentVersion:
        this.restAPI.requestedContentVersion || this.restAPI.contentVersion,
    };

    // store if running in compiler
    this.isCompiler = args.isCompiler;

    // set the authorization value
    this.info.authorization = args.authorization;

    // note supported content types
    this.validContentTypes = ['published'];
    this.validLayoutTypes = this.validContentTypes;

    // define the external API
    this.publicSDK = {
      getInfo: utils.bind(this.getInfo, this),
      getItem: utils.bind(this.getItem, this),
      getItems: utils.bind(this.getItems, this),
      searchItems: utils.bind(this.queryItems, this),
      queryItems: utils.bind(this.queryItems, this),
      getRenditionURL: utils.bind(this.getRenditionURL, this),
      getLayoutInfo: utils.bind(this.getLayoutInfo, this),
      getRecommendationResults: utils.bind(this.getRecommendationResults, this),
      loadContentLayout: utils.bind(this.loadContentLayout, this),
      renderItem: utils.bind(this.renderItem, this),
      expandMacros: utils.bind(this.expandMacros, this),
      getTaxonomies: utils.bind(this.getTaxonomies, this),
      queryTaxonomyCategories: utils.bind(this.queryTaxonomyCategories, this),
    };

    logger.debug('ContentClient.create: Content Info:');
    logger.debug(this.info);
  }

  // common function for evaluating parameters to be used for the REST call
  resolveRESTArgs(method, args) {
    const searchParams = this.restAPI.makeQueryParameters(args);
    const restArgs = utils.extend({}, this.info); // start with the Client properties

    // add in the defaults
    restArgs.method = method;
    restArgs.contentType = this.getContentType(args.contentType);

    // add in authorization
    restArgs.authorization = this.getInfo().authorization;

    // add in the language locale
    restArgs.language = args.language;

    // override call specific properties
    restArgs.beforeSend = args.beforeSend || restArgs.beforeSend;
    restArgs.timeout = args.timeout || restArgs.timeout;

    //
    // add in the searchParam options
    //
    restArgs.postData = searchParams.postData;
    restArgs.useAggregate = searchParams.useAggregate;
    restArgs.assetVersion = searchParams.assetVersion;

    // getData passed in as 'search' parameter for URL construction
    restArgs.search = searchParams.getData;

    // rendition data may have format of the image
    if (args.format) {
      restArgs.format = args.format;
    }

    // links for download
    if ((args.download === true) || (args.download === false)) {
      restArgs.download = args.download;
    }

    // allow searchParams method override from GET to POST
    if (restArgs.method === 'GET') {
      restArgs.method = searchParams.method || restArgs.method;
    }

    return restArgs;
  }

  // Get Content Type based on allowed values
  getContentType(contentType) {
    const requestedType = (typeof contentType === 'string' && contentType.toLowerCase())
      || this.info.contentType;

    if (this.validContentTypes.indexOf(requestedType) !== -1) {
      // return valid type
      return requestedType;
    }
    // warn of invalid type
    logger.warn(
      `Invalid value for content type request: ${contentType}. Allowed values are: ${JSON.stringify(
        this.validContentTypes,
      )}. Defaulting to: ${this.info.contentType}`,
    );

    // default the type
    return this.info.contentType;
  }

  // Get Layout Type based on allowed values
  getLayoutType(layoutType) {
    // default to the contentType if doesn't exist
    const requestedType = (typeof layoutType === 'string' && layoutType.toLowerCase())
      || this.info.contentType;

    if (this.validLayoutTypes.indexOf(requestedType) !== -1) {
      // return valid type
      return requestedType;
    }
    logger.warn(
      `Invalid value for layout type request: ${layoutType}. Allowed values are: ${JSON.stringify(
        this.validLayoutTypes,
      )}. Defaulting to: ${this.info.contentType}`,
    );

    // default the type
    return this.info.contentType;
  }

  // Render the given render.js file with the data into the container
  renderLayout(requireLayout, data, container, preLoadLayout, resolve, reject) {
    // Rendering of layouts not supported on Node
    // Layouts have dependencies on RequireJS AMD structure rather than CommonJS
    if (isNodeJS) {
      reject({
        error: 'renderLayout function not supported under NodeJS',
      });
    } else if (preLoadLayout) {
      // call appropriate render operation
      requireConfig.preloadContentLayout(requireLayout, resolve, reject);
    } else {
      // provide this contentClient to the layout and render it
      const layoutParams = utils.extend({}, data);
      if (!layoutParams.contentClient) {
        layoutParams.contentClient = this.publicSDK;
      }
      requireConfig.renderContentLayout(
        requireLayout,
        layoutParams,
        container,
        resolve,
        reject,
      );
    }
  }

  /**
   * Retrieves the values stored as part of the client object and used on each call.<br/>
   * Once created, these values are immutable for the client instance.
   * @returns {ContentSDK.ContentInfo} The information the SDK is using to
   * retrieve content from Oracle Content Management.
   * @example
   * // get the information on the server and the state used by calls to this client
   * console.log(contentClient.getInfo());
   */
  getInfo() {
    // return a copy of the values
    return utils.extend({}, this.info);
  }

  /**
   * Get a single item given its ID or SLUG. <br/>
   * The ID can be found in the search results.
   * @param {object} args - A JavaScript object containing the "getItem" parameters.
   * @param {string} [args.id] - The ID of the content item to return.
   * <br/>The ID or SLUG must be specified.
   * @param {string} [args.slug] - The SLUG of the content item to return,
   * used instead of id. <br/>The ID or SLUG must be specified.
   * @param {string} [args.language] - The language locale variant of the
   * content item to return.
   * @param {string} [args.version] - The version of the asset to return.
   * Should only be used when calling getItem in a preview, not a delivery
   * context. Ignored if language is specified
   * @param {function} [args.beforeSend=undefined] - A callback passing in
   * the xhr (browser) or options (node) object before making the REST call.
   * @returns {Promise} A JavaScript Promise object that can be used to retrieve
   * the data after the call has completed.
   * @example
   * // Getting item by ID
   * contentPromise = contentClient.getItem({
   *     'id': contentId
   * });
   *
   *
   * // Getting item by SLUG
   * contentPromise = contentClient.getItem({
   *     'slug': contentSlug
   * });
   *
   * // handle the result
   * contentPromise.then(
   *     function (result) {
   *         console.log(result);
   *     },
   *     function (error) {
   *         console.log(error);
   *     }
   * );
   */
  getItem(params) {
    const args = params || {};
    const guid = args.id || args.ID || args.itemGUID;
    const restCallArgs = this.resolveRESTArgs('GET', args);

    // create the URL
    const url = this.restAPI.formatURL(
      this.restAPI.resolveGetItemPath({
        itemGUID: guid,
        assetVersion: restCallArgs.assetVersion,
        useAggregate: restCallArgs.useAggregate,
        language: params.language,
        slug: params.slug,
      }),
      restCallArgs,
    );

    // make the rest call
    return this.restAPI.callRestServer(url, restCallArgs);
  }

  /**
   * Get a list of items that is returned by the recommendation ID. <br/>
   * @ignore
   * @param {object} args - A JavaScript object containing the
   * "getRecommendationResults" parameters.
   * @param {string} args.id - The ID of the Recommendation to run.
   * @param {string} args.audienceAttributes -  Audience attributes
   * that can be filtered by the attribute's categoryId
   * @param {function} [args.beforeSend=undefined] - A callback passing
   * in the xhr (browser) or options (node) object before making the REST call.
   * @returns {Promise} A JavaScript Promise object that can be used to
   * retrieve the data after the call has completed.
   * @example
   * contentPromise = contentClient.getRecommendationResults({
   *     'id': recommendationId
   * });
   *
   * // handle the result
   * contentPromise.then(
   *     function (result) {
   *         console.log(result);
   *     },
   *     function (error) {
   *         console.log(error);
   *     }
   * );
   */
  getRecommendationResults(params) {
    const args = params || {};
    const id = args.id || args.ID || args.itemGUID;
    const { apiName } = args;
    const contentType = params.contentType || this.info.contentType;
    let restCallArgs;

    // The Delivery API requires a GET, while the Management API requires a POST
    if (contentType === 'published') {
      restCallArgs = this.resolveRESTArgs('GET', args);

      // append audience attributes to the query string
      if (params.audienceAttributes) {
        Object.keys(params.audienceAttributes).forEach(
          (audienceAttributeName) => {
            // the recommendationResults GET API requires prepending 'attribute.' to each AA
            // bug 31212841 - multi-valued audience attribute added by repeating the name
            // value pairs.
            // by the time multi-valued AA gets here, it is an array of strings
            let attrVals = params.audienceAttributes[audienceAttributeName];
            if (!Array.isArray(attrVals)) {
              attrVals = [attrVals];
            }

            const queryParam = attrVals
              .map(
                (value) => `${encodeURIComponent(
                  `attribute.${audienceAttributeName}`,
                )}=${encodeURIComponent(value)}`,
              )
              .join('&');

            // append the audience attribute to the query string
            if (restCallArgs.search) {
              restCallArgs.search = `${restCallArgs.search}&${queryParam}`;
            } else {
              restCallArgs.search = queryParam;
            }
          },
        );
      }
    } else {
      restCallArgs = this.resolveRESTArgs('POST', args);

      // setup the recommendation specific arguments
      //  - recommendations do not require management calls so the CSRF
      // token should not be required for POST requests
      restCallArgs.noCSRFToken = true;

      // add in the POST values
      const assetState = this.info.contentType === 'published' ? 'PUBLISHED' : 'ALL';

      if (params.audienceAttributes) {
        restCallArgs.postData = {
          audienceAttributes: params.audienceAttributes,
          assetState,
        };
      }
    }

    // create the URL
    const url = this.restAPI.formatURL(
      this.restAPI.resolveGetRecommendationPath({
        id,
        apiName,
      }),
      restCallArgs,
    );

    // make the rest call
    return this.restAPI.callRestServer(url, restCallArgs);
  }

  /**
   * Get a list of items based on their IDs.
   *
   * @param {object} args - A JavaScript object containing the "getItems" parameters.
   * @param {array} [args.ids=[]] - Restrict results to the list of requested items.
   * @param {string} args.language - The language locale variant of the content items to return.
   * @param {function} [args.beforeSend=undefined] - A callback passing in the xhr
   * (browser) or options (node) object before making the REST call.
   * @param {string} [args.fields='ALL'] - Any additional properties in the "args"
   * object will be added to the query string parameters; for example, "fields".
   * @returns {Promise} A JavaScript Promise object that can be used to retrieve the
   * data after the call has completed.
   * @example
   * // get all items
   * contentClient.getItems().then(function (items) {
   *     console.log(items);
   * });
   *
   * @example
   * // get all items and order by type and name
   * contentClient.getItems().then(function (data) {
   *     // sort by type and then by name
   *     console.log(data.items.sort(function (a, b) {
   *         if (a.type.localeCompare(b.type) !== 0) {
   *             return a.type.localeCompare(b.type);
   *         } else {
   *             return a.name.localeCompare(b.name);
   *         }
   *     }));
   * });
   */
  getItems(params) {
    const self = this;
    const args = params || {};
    const guids = args.ids || args.IDs || args.itemGUIDs;
    const restCallArgs = self.resolveRESTArgs('GET', args);
    let url;

    logger.debug('ContentClient.getItems: arguments');
    logger.debug(args);

    // if a list of items is supplied
    if (Array.isArray(guids) && guids.length > 0) {
      const { length } = guids;
      const chunk = 10;
      let chunkGUIDs;
      const bulkChunks = [];
      const bulkPromise = new Promise((resolve, reject) => {
        // break array up into into groups of 10
        for (let i = 0; i < length; i += chunk) {
          // get this chunk of GUIDs
          chunkGUIDs = guids.slice(i, i + chunk);

          // use bulk API for this chunk of content item IDs
          url = self.restAPI.formatURL(
            self.restAPI.resolveGetBulkItemListPath({
              itemGUIDs: chunkGUIDs,
              types: args.types,
              useAggregate: restCallArgs.useAggregate,
              language: restCallArgs.language,
            }),
            restCallArgs,
          );

          bulkChunks.push(self.restAPI.callRestServer(url, restCallArgs));
        }

        // resolve bulkChunks Promises when all requests complete
        Promise.all(bulkChunks).then(
          (arrayOfResults) => {
            const allContentItems = {
              items: [],
            };

            // handle v1 format
            if (self.info.contentVersion === 'v1') {
              allContentItems.items = {};

              // combine all the results
              arrayOfResults.forEach((results) => {
                if (results && results.items) {
                  allContentItems.items = utils.extend(
                    allContentItems.items,
                    results.items,
                  );
                }
              });
            } else {
              // combine all the results
              arrayOfResults.forEach((results) => {
                allContentItems.items = allContentItems.items.concat(
                  results.items,
                );
              });
            }

            // resolve with all the items
            resolve(allContentItems);
          },
          (err) => {
            reject(err);
          },
        );
      });

      // return the outer promise object, which will be resolved after all the items return
      return bulkPromise;
    }

    // No list of IDs defined, get all the items based on the search query
    url = self.restAPI.formatURL(
      self.restAPI.resolveGetItemListPath({
        itemGUID: args.itemGUID,
        types: args.types,
        useAggregate: restCallArgs.useAggregate,
      }),
      restCallArgs,
    );

    return self.restAPI.callRestServer(url, restCallArgs);
  }

  /**
   * Get a list of items based on SCIM search criteria.<br/>
   * All arguments are passed through to the Content Delivery REST API call.
   *
   * @param {object} args - A JavaScript object containing the "queryItems" parameters.
   * @param {string} [args.q=''] - An SCIM query string to restrict results.
   * @param {string} [args.fields=''] - A list of fields to include for each item returned.
   * @param {number} [args.offset] - Return results starting at this number in the results.
   * @param {number} [args.limit] - Limit the number of items returned.
   * @param {array|string} [args.orderBy=[]] - The order by which results should be returned.
   * @param {function} [args.beforeSend=undefined] - A callback passing in the xhr (browser)
   * or options (node) object before making the REST call.
   * @returns {Promise} A JavaScript Promise object that can be used to retrieve the data
   * after the call has completed.
   * @example
   * // get all items and order by type and name
   * contentClient.queryItems({
   *     'q': '(type eq "' + contentType + '")',
   *     'fields': 'ALL'
   * }).then(function (items) {
   *     console.log(items);
   * });
   */
  queryItems(params) {
    const self = this;
    const args = params || {};
    const restCallArgs = this.resolveRESTArgs('GET', args);

    logger.debug('ContentClient.queryItems: arguments');
    logger.debug(args);

    // setup the search specific arguments
    //  - search does not require management calls so the CSRF token should
    // not be required for POST requests
    restCallArgs.noCSRFToken = true;

    // format the URL
    const url = self.restAPI.formatURL(
      self.restAPI.resolveSearchPath(),
      restCallArgs,
    );

    return self.restAPI.callRestServer(url, restCallArgs);
  }

  /**
   * Get categories for the specified taxonomy.<br/>
   * All arguments are passed through to the Content Delivery REST API call.
   *
   * @param {object} args - A JavaScript object containing the "queryTaxonomyCategories" parameters.
   * @param {string} args.id - The ID of the taxonomy.
   * @returns {Promise} A JavaScript Promise object that can be used to retrieve the
   * data after the call has completed.
   * @example
   * // get all categories for a taxonomy
   * client.queryTaxonomyCategories({
   *      'id': taxonomyId,
   *      'q': '(name eq "' + categoryName + '")',
   * }).then(function (topLevelItem) {
   *      console.log(topLevelItem);
   *      return topLevelItem;
   * });
   */
  queryTaxonomyCategories(params) {
    const args = params || {};
    const guid = args.id || args.ID || args.itemGUID;
    const restCallArgs = this.resolveRESTArgs('GET', args);

    // create the URL
    const url = this.restAPI.formatURL(
      this.restAPI.resolveQueryTaxonomyCategoriesPath({
        taxonomyGUID: guid,
      }),
      restCallArgs,
    );

    return this.restAPI.callRestServer(url, restCallArgs);
  }

  /**
   * Get taxonomies for the channel.<br/>
   * All arguments are passed through to the Content Delivery REST API call.
   *
   * @param {object} params - A JavaScript object containing the "getTaxonomies" parameters.
   * @returns {Promise} A JavaScript Promise object that can be used to retrieve
   * the data after the call has completed.
   * @example
   * // get all taxonomies
   * client.getTaxonomies().then(function (topLevelItem) {
   *      console.log(topLevelItem);
   *      return topLevelItem;
   * }, function (xhr, status, error) {
   *      console.log(xhr.responseText);
   * });
   */
  getTaxonomies(params) {
    const args = params || {};
    const restCallArgs = this.resolveRESTArgs('GET', args);

    // create the URL
    const url = this.restAPI.formatURL(
      this.restAPI.resolveGetTaxonomiesPath(args),
      restCallArgs,
    );

    // make the rest call
    return this.restAPI.callRestServer(url, restCallArgs);
  }

  /**
   * Get the native URL to render an image asset.<br/>
   * @returns {string} A fully qualified URL to the published image asset.
   * @param {object} args - A JavaScript object containing the "getRenditionURL" parameters.
   * @param {string} args.id - The ID of the image asset. One of 'id' or 'slug' must be
   * provided for the function to return a URL.
   * @param {string} args.slug - The slug of the image asset. One of 'id' or 'slug' must be
   * provided for the function to return a URL.
   * @param {string } [args.type='native']  - The name of the desired rendition
   * @param {string} [args.format] - The desired format. Required for non-native renditions
   * but ignored for native. For image assets the value should be 'jpg' or 'webp'.
   * @param {boolean} [args.download] - Pass <i>true</i> to add &download=true or <i>false</i>
   * for &download=false.  This flag will force a content-disposition of 'attachment' or
   * 'inline'.  If unspecified, the content server will choose a disposition based on
   * the type of asset.
   * @example
   * //get the native rendition URL for this client
   * contentClient.getRenditionURL({
   *     id: 'CONTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1'
   * });
   *  @example
   * //get the Thumbnail rendition URL for an image in JPEG format
   * contentClient.getRenditionURL({
   *     id: 'CONTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1',
   *     type: 'Thumbnail',
   *     format: 'jpg'
   * });
   *  @example
   * //get the native rendition URL, to be rendered inline
   * contentClient.getRenditionURL({
   *     id: 'CONTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1',
   *     download: false
   * });
   *  @example
   * //get the native rendition URL by slug, to be rendered inline
   * contentClient.getRenditionURL({
   *     slug: 'pageBanner,
   *     download: false
   * });
   */
  getRenditionURL(params) {
    const self = this;
    const args = params || {};
    const guid = args.id || args.ID || args.itemGUID;
    const { slug } = args;
    const renditionName = args.rendition || args.type;
    const restCallArgs = self.resolveRESTArgs('GET', args);

    if (this.isCompiler) {
      // encode into a macro and let the compiler expand
      return `[!--$SCS_DIGITAL_ASSET--]${guid}[/!--$SCS_DIGITAL_ASSET--]`;
    }
    return self.restAPI.getRenditionURL(guid, slug, renditionName, restCallArgs);
  }

  /**
   * Retrieve metadata information about the content layout. <br/>
   * <b>Note:</b> This method isn't supported if the Content Delivery SDK is used in NodeJS.
   * @param {object} args - A JavaScript object containing the "getLayoutInfo" parameters.
   * @param {string} args.layout - Name of the layout in the component catalog for Oracle
   * Content Management.
   * @returns {Promise} JavaScript Promise object that is resolved when the metadata for
   * the layout is retrieved.
   * @example
   * // get the Content REST API versions supported by the content layout
   * contentClient.getLayoutInfo({
   *     'layout': contentLayout
   * }).then(
   *     function (layoutInfo) {
   *         // determine the content versions supported by the layout
   *         console.log('Content versions supported: ' + layoutInfo.contentVersion)
   *     },
   *     function (error) {
   *         console.log('Error getting data: ' + error);
   *     }
   * );
   */
  getLayoutInfo(params) {
    const self = this;
    const args = params || {};
    const isSystemLayout = ['system-default-layout', 'system-tile-layout'].indexOf(args.layout) > -1;
    let layoutType;
    let layoutFactory;

    return new Promise((resolve, reject) => {
      // validate required parameters passed
      if (args.layout) {
        // get the layout type and path to the content layout factory .js file
        if (isSystemLayout) {
          layoutType = 'system';
          layoutFactory = args.layout;
        } else {
          layoutType = self.getLayoutType(args.layoutType);
          layoutFactory = `${args.layout}/assets/render`;
        }

        // construct the require path to the content layout factory .js file
        const requireLayout = `${
          requireConfig.getContentLayoutRequirePath(self.info) + layoutType
        }/${layoutFactory}`;
        logger.debug(
          `ContentClient.getLayoutInfo: require path: ${requireLayout}`,
        );

        // attempt to require in the layout
        require([requireLayout], (ContentLayout) => {
          let layoutContentVersion = ContentLayout.prototype.contentVersion;
          // default the version if not defined
          if (!layoutContentVersion) {
            // notify the user
            logger.warn(
              `Content Layout: "${args.layout}" does not have a contentVersion specified. Assuming data needs to be fetched in "v1.0" format for this Content Layout.  To avoid this message, add the prototype.contentVersion property to the Content Layout Factory object.`,
            );

            layoutContentVersion = '1.0.0';
          }

          // return information about the layout
          resolve({
            name: args.layout,
            layoutFactory,
            layoutType,
            requirePath: requireLayout,
            contentVersion: layoutContentVersion,
          });
        });
      } else {
        logger.debug(
          'ContentClient.getLayoutInfo: missing required parameters',
        );

        // invalid parmaters
        reject(
          `missing parameters in call to getLayoutInfo: ${JSON.stringify(args)}`,
        );
      }
    });
  }

  /**
   * Require in the requested content layout
   * <b>Note:</b> This method isn't supported if the Content Delivery SDK is used in NodeJS.
   * @param {object} args - A JavaScript object containing the "renderItem" parameters.
   * @param {string} args.layout - Name of the layout to use to render the component.
   * @returns {Promise} JavaScript Promise object that is resolved when the layout
   * JavaScript is loaded
   */
  loadContentLayout(params) {
    const self = this;
    const args = params || {};
    const isSystemLayout = ['system-default-layout', 'system-tile-layout'].indexOf(args.layout) > -1;
    let layoutType;
    let layoutFactory;
    const loadItemPromise = new Promise((resolve, reject) => {
      // validate required parameters passed
      if (args.layout) {
        // get the layout type and path to the content layout factory .js file
        if (isSystemLayout) {
          layoutType = 'system';
          layoutFactory = args.layout;
        } else {
          layoutType = self.getLayoutType(args.layoutType);
          layoutFactory = `${args.layout}/assets/render`;
        }

        // construct the require path to the content layout factory .js file
        const requireLayout = `${
          requireConfig.getContentLayoutRequirePath(self.info) + layoutType
        }/${layoutFactory}`;
        logger.debug(
          `ContentClient.renderItem: require path: ${requireLayout}`,
        );

        require([requireLayout], (ContentLayout) => {
          resolve(ContentLayout);
        });
      } else {
        logger.debug('ContentClient.renderItem: missing required parameters');

        // invalid parmaters
        reject(
          `missing parameters in call to renderLayout: ${JSON.stringify(args)}`,
        );
      }
    });

    return loadItemPromise;
  }

  /**
   * Render the given data or content item using the named layout in the given container.<br>
   * <b>Note:</b> This method isn't supported if the Content Delivery SDK is used in NodeJS.
   * @param {object} args - A JavaScript object containing the "renderItem" parameters.
   * @param {object} args.data - JSON data to use to render.
   * @param {string} args.layout - Name of the layout to use to render the component.
   * @param {DOMElement} args.container - Container DOMElement to append to.
   * @returns {Promise} JavaScript Promise object that is resolved when the layout is
   * loaded and rendered into the container.
   * @example
   * // render the item into the DOM element with a custom content layout expecting data
   * compatible with Oracle Content Management Sites
   * contentClient.getItem({
   *     'id': contentId
   * }).then(
   *     function (contentItemData) {
   *         // now the data is retrieved, render the layout
   *         contentClient.renderItem({
   *             'data': {
   *                 contentItemData: contentItemData,
   *                 scsData {
   *                     contentClient: contentClient
   *                 }
   *             },
   *             'layout': contentLayout,
   *             'container': document.getElementById(containerDivId)
   *         }).then(
   *             function () {
   *                 // render complete
   *                 console.log('layout added to the page');
   *             },
   *             function (error) {
   *                 console.log('error rendering layout onto the page: ' + JSON.stringify(error));
   *             }
   *         );
   *     },
   *     function (error) {
   *         console.log('Error getting data: ' + error);
   *     }
   * );
   * @example
   * // render the item into the DOM element with a custom content layout expecting custom data
   * contentClient.getItem({
   *     'id': contentId
   * }).then(
   *     function (data) {
   *         // now the data is retrieved, render the layout
   *         contentClient.renderItem({
   *             'data': data,
   *             'layout': contentLayout,
   *             'container': document.getElementById(containerDivId)
   *         }).then(
   *             function () {
   *                 // render complete
   *                 console.log('layout added to the page');
   *             },
   *             function (error) {
   *                 console.log('error rendering layout onto the page: ' + JSON.stringify(error));
   *             }
   *         );
   *     },
   *     function (error) {
   *         console.log('Error getting data: ' + error);
   *     }
   * );
   */
  renderItem(params) {
    const self = this;
    const args = params || {};
    const isSystemLayout = ['system-default-layout', 'system-tile-layout'].indexOf(args.layout) > -1;
    let layoutType;
    let layoutFactory;
    const renderItemPromise = new Promise((resolve, reject) => {
      // validate required parameters passed
      if (args.layout) {
        // get the layout type and path to the content layout factory .js file
        if (isSystemLayout) {
          layoutType = 'system';
          layoutFactory = args.layout;
        } else {
          layoutType = self.getLayoutType(args.layoutType);
          layoutFactory = `${args.layout}/assets/render`;
        }

        // construct the require path to the content layout factory .js file
        const requireLayout = `${
          requireConfig.getContentLayoutRequirePath(self.info) + layoutType
        }/${layoutFactory}`;
        logger.debug(
          `ContentClient.renderItem: require path: ${requireLayout}`,
        );

        // dynamically require in the layout and add it to the page
        self.renderLayout(
          requireLayout,
          args.data,
          args.container,
          args.preloadLayout,
          resolve,
          reject,
        );
      } else {
        logger.debug('ContentClient.renderItem: missing required parameters');

        // invalid parmaters
        reject(
          `missing parameters in call to renderLayout: ${JSON.stringify(args)}`,
        );
      }
    });

    // return the JQuery deferrred object
    return renderItemPromise;
  }

  /**
   * Expand Content Macros.<br/>
   * Content item fields can contain macros that reference other content items.
   * For example, a Rich Text field can have links to digital assets. <br/>
   * If a field that you want to render can contain macros, you can use this utilty function to
   * expand the macros.
   * @param {string} fieldValue - A field value that may contain macros.
   * @returns {string} The "fieldValue" string with all macros expanded.
   * @example
   * // expand any macros
   * console.log(contentClient.expandMacros(
   *   '<img src="[!--$CEC_DIGITIAL_ASSET--]CONT21B61179DFA73E8B5BCF[/!--$CEC_DIGITAL_ASSET--]"/>');
   *
   */
  expandMacros(fieldValue) {
    let afterValue = fieldValue || '';
    logger.log(`expandMacros: beforeValue: ${fieldValue}`);

    // supported macros
    let macros = [
      {
        name: 'DIGITAL_ASSET',
        macro: /\[!--\$CEC_DIGITAL_ASSET--\]*(.*?) *\[\/!--\$CEC_DIGITAL_ASSET--\]/g,
        value: utils.bind(function (matchString, digitalAssetIDStr) {
          let assetId = digitalAssetIDStr;
          let isDownload = false;
          let idStrParts;

          if (digitalAssetIDStr.indexOf(',')) {
            idStrParts = digitalAssetIDStr.split(',');
            assetId = idStrParts[0];
            isDownload = idStrParts[1] === 'true';
          }

          return this.getRenditionURL({
            id: assetId,
            download: isDownload,
          });
        }, this),
      },
      {
        name: 'PAGE_LINK',
        macro: /\[!--\$SCS_PAGE--\]*(.*?) *\[\/!--\$SCS_PAGE--\]/g,
        value: utils.bind((matchString, page) => {
          let pageId;
          const renderApi = (window && window.SCSRenderAPI) || {};
          if (typeof renderApi.getPageLinkData === 'function') {
            const pageLinkData = renderApi.getPageLinkData(page);
            pageId = pageLinkData && pageLinkData.href;
          } else if (typeof renderApi.getPageLinkUrl === 'function') {
            pageId = renderApi.getPageLinkUrl(page);
          }
          return pageId || '#';
        }, this),
      },
    ];

    // if it's a compiler, remove macros that compiler will expand
    if (this.isCompiler) {
      // currently compiler can handle all macros
      macros = [];
    }

    const expandString = function expandString(stringValue) {
      let expandedString = stringValue;
      // expand each of the supported macros
      macros.forEach((macroEntry) => {
        expandedString = expandedString.replace(
          macroEntry.macro,
          macroEntry.value,
        );
      });
      return expandedString;
    };

    const expandField = function expandField(obj) {
      let expandedValue = obj;
      if (typeof obj === 'string') {
        expandedValue = expandString(obj);
      } else if (obj && typeof obj === 'object') {
        // traverse the object
        if (Array.isArray(obj)) {
          // expand all entries in the array
          expandedValue = obj.map((entry) => expandField(entry));
        } else {
          // expand all properties of the object
          expandedValue = {};
          Object.keys(obj).forEach((key) => {
            expandedValue[key] = expandField(obj[key]);
          });
        }
      }

      return expandedValue;
    };
    afterValue = expandField(afterValue);

    logger.log(`expandMacros: afterValue: ${afterValue}`);

    return afterValue;
  }
}

//
// ------------------------ Content Client Preview SDK -----------------------------
//

/**
 * Client content preview SDK object to interact with draft content in
 * Oracle Content Management:
 * <ul>
 * <li>Authenticated connection to the Content Server.</li>
 * <li>Read content types.</li>
 * <li>Read draft content items.</li>
 * <li>Render draft content using named content layouts.</li>
 * </ul>
 * The content preview client SDK object uses the "/management/" Content
 * REST API calls.  This requires the user to be logged in to the system.
 * @constructor
 * @alias ContentPreviewClient
 * @augments ContentDeliveryClient
 * @param {object} args - A JavaScript object containing the parameters to
 * create the content preview client instance.
 * @param {string} [args.contentServer='protocol://host:port'] - URL to the
 * Oracle Content Management instance providing content.  The default
 * assumes the current '<i>protocol</i>://<i>host</i>:<i>port</i>'.
 * @param {('v1' | 'v1.1')} [args.contentVersion='v1.1'] - The version of
 * the content preview REST API to use.
 * @param {string} args.channelToken - The Oracle Content Management
 * instance token for accessing published content.
 * @param {string} [args.cacheBuster=''] - The URL parameter used to control
 * whether or not content is fetched from the browser cache.
 * @param {boolean} [args.secureContent=false] - Content is secured and requires
 * sign-in to view.
 * @param {string} [args.authorization] - Authorization header to include in the request.
 * @param {function} [args.beforeSend=undefined] - Callback passing in the xhr
 * (browser) or options (node) object before making the REST call.
 * @param {string} [args.timeout=0] - Timeout for the AJAX calls. Defaults to no timeout.
 * @param {object} args.logger - An object that implements the standard log
 * functions: ['error', 'warn', 'info', 'debug', 'log'].
 * @returns {ContentPreviewClient}
 */
class ContentPreviewClientImpl extends ContentDeliveryClientImpl {
  constructor(args) {
    super(args);

    this.restAPI = restAPIFactory.createRestAPI(args.contentVersion);

    // update the logger entries
    logger.updateLogger(args.logger);

    // store the given properties
    this.info = {
      accessToken: args.channelToken || args.accessToken,
      channelToken: args.channelToken || args.accessToken,
      beforeSend: args.beforeSend,
      cacheBuster: args.cacheBuster,
      clientType: 'preview',
      contentServer: this.restAPI.extractServer(args.contentServer),
      contentType:
        args.contentType && args.contentType.toLowerCase() === 'published'
          ? 'published'
          : 'draft',
      secureContent: args.secureContent || false,
      timeout: args.timeout || 0,
      contentVersion:
        this.restAPI.requestedContentVersion || this.restAPI.contentVersion,
    };

    // store if running in compiler
    this.isCompiler = args.isCompiler;

    // set the authorization value
    this.info.authorization = args.authorization;

    // note supported content types
    this.validContentTypes = ['published', 'draft'];
    this.validLayoutTypes = this.validContentTypes;

    // define the external API
    this.publicSDK = {
      getInfo: utils.bind(this.getInfo, this),
      getItem: utils.bind(this.getItem, this),
      getItems: utils.bind(this.getItems, this),
      searchItems: utils.bind(this.queryItems, this),
      queryItems: utils.bind(this.queryItems, this),
      getRenditionURL: utils.bind(this.getRenditionURL, this),
      getLayoutInfo: utils.bind(this.getLayoutInfo, this),
      getRecommendationResults: utils.bind(this.getRecommendationResults, this),
      loadContentLayout: utils.bind(this.loadContentLayout, this),
      renderItem: utils.bind(this.renderItem, this),
      expandMacros: utils.bind(this.expandMacros, this),
      getTypes: utils.bind(this.getTypes, this),
      getType: utils.bind(this.getType, this),
      getTaxonomies: utils.bind(this.queryTaxonomies, this),
      queryTaxonomies: utils.bind(this.queryTaxonomies, this),
      queryTaxonomyCategories: utils.bind(this.queryTaxonomyCategories, this),
    };

    logger.debug('ContentClient.create: Content Info:');
    logger.debug(this.info);
  }

  /**
   * Get a list of item types based on the search criteria.
   * @param {object} args A JavaScript object containing the "getTypes"
   * parameters. If empty, it will return all content types.
   * @param {number} [args.limit] - Limit the number of content types returned.
   * @param {number} [args.offset] - Return results starting at this number in
   * the results.
   * @param {function} [args.beforeSend=undefined] - A callback passing in the
   * xhr (browser) or options (node) object before making the REST call.
   * @returns {Promise} A JavaScript Promise object that can be used to retrieve
   * the data after the call has completed.
   * @example
   * contentClient.getTypes().then(
   *     function (data) {
   *         console.log(data);
   *     }).catch(function (error) {
   *         console.log(error);
   *     });
   * @example
   * contentClient.getTypes({
   *     limit: 10
   * }).then(
   *     function (data) {
   *         console.log(data);
   *     }).catch(function (error) {
   *         console.log(error);
   *     });
   */
  getTypes(params) {
    const self = this;
    const args = params || {};
    const restCallArgs = self.resolveRESTArgs('GET', args);

    logger.debug('ContentClient.getTypes: arguments');
    logger.debug(args);

    const url = self.restAPI.formatURL(
      self.restAPI.resolveGetTypesPath(),
      restCallArgs,
    );

    return self.restAPI.callRestServer(url, restCallArgs);
  }

  /**
   * Get a single item type given it's name. <br/>
   * The name can be found from the search results.
   * @param {object} args A JavaScript object containing the "getType" parameters.
   * @param {string} args.typeName The name of the content type to return.
   * @returns {Promise} A JavaScript Promise object that can be used to retrieve
   * the data after the call has completed
   * @example
   * contentClient.getType({
   *     'typeName': 'Customer'
   * }).then(
   *     function (data) {
   *         console.log(data);
   *     }).catch(function (error) {
   *         console.log(error);
   *     });
   */
  getType(params) {
    const self = this;
    const args = params || {};
    const restCallArgs = self.resolveRESTArgs('GET', args);

    logger.debug('ContentClient.getType: arguments');
    logger.debug(args);

    const url = self.restAPI.formatURL(
      self.restAPI.resolveGetTypePath({
        typeName: args.typeName,
      }),
      restCallArgs,
    );

    return self.restAPI.callRestServer(url, restCallArgs);
  }

  /**
   * Get taxonomies for the channel.<br/>
   * All arguments are passed through to the Content Delivery REST API call.
   *
   * @param {object} params - A JavaScript object containing the "queryTaxonomies" parameters.
   * @returns {Promise} A JavaScript Promise object that can be used to retrieve
   * the data after the call has completed.
   * @example
   * // get all taxonomies in draft status
   * client.queryTaxonomies({
   *      'q': '(status eq "' + draft + '")',
   * }).then(function (topLevelItem) {
   *      return topLevelItem;
   * }, function (xhr, status, error) {
   *      console.log(xhr.responseText);
   * });
   */
  queryTaxonomies(params) {
    return this.getTaxonomies(params);
  }
}

//
// ------------------------------- Content SDK -------------------------------------
//

/**
 * @constructor
 * @alias ContentSDK
 */

class contentSDK {
  /**
   * Create a client content SDK object to interact with content published
   * in Oracle Content Management:
   * <ul>
   * <li>Read the published content items</li>
   * <li>Render published content using named content layouts</li>
   * </ul
   * @memberof ContentSDK
   * @param {object} args - A JavaScript object containing the parameters to
   * create the content delivery client instance.
   * @param {string} [args.contentServer='protocol://host:port'] - URL to the
   * Oracle Content Management instance providing content.  The default
   * assumes the current '<i>protocol</i>://<i>host</i>:<i>port</i>'.
   * @param {('v1' | 'v1.1')} [args.contentVersion='v1.1'] - The version of the
   * content delivery REST API to use.
   * @param {string} args.channelToken - The Oracle Content Management instance
   * token for accessing published content.
   * @param {string} [args.cacheBuster=''] - The URL parameter used to control
   * whether or not content is fetched from the browser cache.
   * @param {boolean} [args.secureContent=false] - Content is secured and requires sign-in to view.
   * @param {string} [args.authorization] - Authorization header to include in the request.
   * @param {function} [args.beforeSend=undefined] - Callback passing in the xhr
   * (browser) or options (NodeJS) object before making the REST call.
   * @param {string} [args.timeout=0] - Timeout for the AJAX calls, defaults to no timeout.
   * @param {object} args.logger - An object that implements the standard log functions:
   * ['error', 'warn', 'info', 'debug', 'log'].
   * @returns {ContentDeliveryClient}
   *
   * @example
   * // create a ContentDeliveryClient and output logging 'info' messages to the console
   * var contentClient = contentSDK.createDeliveryClient({
   *     'contentServer': contentServer,
   *     'channelToken': channelToken,
   *     'logger': {
   *         info: function (message) {
   *             console.log(message);
   *         }
   *     }
   * });
   */
  static createDeliveryClient(params) {
    // create the delivery client with the given args
    const newSDK = new ContentDeliveryClientImpl(
      typeof params === 'object' ? params : {},
    );

    logger.debug(
      'ContentSDK.createDelivery: created new Content SDK client object:',
    );
    logger.debug(newSDK);

    // expose public SDK if it was created or undefined if it failed
    return newSDK ? newSDK.publicSDK : undefined;
  }

  /**
   * Create a client content preview SDK object to interact with draft content
   * in Oracle Content Management:
   * <ul>
   * <li>Authenticated connection to the Content Server.</li>
   * <li>Read content types.</li>
   * <li>Read draft content items.</li>
   * <li>Render draft content using named content layouts.</li>
   * </ul>
   * The content preview client SDK object uses the "/management/" Content REST
   * API calls.  This requires the user to be logged in to the system.
   * @memberof ContentSDK
   * @param {object} args - A JavaScript object containing the parameters to create
   * the content delivery client instance.
   * @param {string} [args.contentServer='protocol://host:port'] - URL to the Oracle
   * Content Management instance providing content.  The default assumes the
   * current '<i>protocol</i>://<i>host</i>:<i>port</i>'.
   * @param {('v1' | 'v1.1')} [args.contentVersion='v1.1'] - The version of the
   * content delivery REST API to use.
   * @param {string} args.channelToken - The Oracle Content Management instance
   * token for accessing published content.
   * @param {string} [args.cacheBuster=''] - The URL parameter used to control whether
   * or not content is fetched from the browser cache.
   * @param {boolean} [args.secureContent=false] - Content is secured and requires sign-in to view.
   * @param {string} [args.authorization] - Authorization header to include in the request.
   * @param {function} [args.beforeSend=undefined] - Callback passing in the xhr
   * (browser) or options (NodeJS) object before making the REST call.
   * @param {string} [args.timeout=0] - Timeout for the AJAX calls, defaults to no timeout.
   * @param {object} args.logger - An object that implements the standard log functions:
   * ['error', 'warn', 'info', 'debug', 'log'].
   * @returns {ContentPreviewClient}
   *
   * @example
   * // create a ContentPreviewClient and output logging 'info' messages to the console
   * var contentClient = contentSDK.createPreviewClient({
   *     'contentServer': contentServer,
   *     'channelToken': channelToken,
   *     'logger': {
   *         info: function (message) {
   *             console.log(message);
   *         }
   *     }
   * });
   */
  static createPreviewClient(params) {
    const newSDK = new ContentPreviewClientImpl(
      typeof params === 'object' ? params : {},
    );

    logger.debug(
      'ContentSDK.createPreviewClient: created new Content SDK client object:',
    );
    logger.debug(newSDK);

    // expose public SDK if it was created or undefined if it failed
    return newSDK ? newSDK.publicSDK : undefined;
  }

  /**
   * Content Client Information
   * @typedef {Object} ContentInfo
   * @memberof ContentSDK
   * @property {string} contentServer - The URL to the server for content.
   * @property {string} clientType - The type of content client ['delivery' | 'preview'].
   * @property {string} contentType - Whether to access 'published' or 'draft' content.
   * @property {string} contentVersion - The version of the Content Delivery REST API to use.
   * @property {string} channelToken - The Oracle Content Management instance token
   * for accessing published content.
   * @property {boolean} secureContent - Content is secured and requires sign-in to view.
   * @property {string} authorization - Authorization header to include in the request.
   * @property {string} beforeSend - Callback passing in the xhr (browser) or options
   * (node) object before making the REST call.
   * @property {string} timeout - Default timeout for AJAX calls, which can be overridden
   * on an individual call basis.
   * @property {string} cacheBuster - Adds "cb={cacheBusterValue}" to the URL to enable
   * distinct browser caching of GET requests.
   */
}

/**
   * Create a client content SDK object to interact with content published
   * in Oracle Content Management:
   * <ul>
   * <li>Read the published content items</li>
   * <li>Render published content using named content layouts</li>
   * </ul
   * @param {object} args - A JavaScript object containing the parameters to
   * create the content delivery client instance.
   * @param {string} [args.contentServer='protocol://host:port'] - URL to the
   * Oracle Content Management instance providing content.  The default
   * assumes the current '<i>protocol</i>://<i>host</i>:<i>port</i>'.
   * @param {('v1' | 'v1.1')} [args.contentVersion='v1.1'] - The version of the
   * content delivery REST API to use.
   * @param {string} args.channelToken - The Oracle Content Management instance
   * token for accessing published content.
   * @param {string} [args.cacheBuster=''] - The URL parameter used to control
   * whether or not content is fetched from the browser cache.
   * @param {boolean} [args.secureContent=false] - Content is secured and requires sign-in to view.
   * @param {string} [args.authorization] - Authorization header to include in the request.
   * @param {function} [args.beforeSend=undefined] - Callback passing in the xhr
   * (browser) or options (NodeJS) object before making the REST call.
   * @param {string} [args.timeout=0] - Timeout for the AJAX calls, defaults to no timeout.
   * @param {object} args.logger - An object that implements the standard log functions:
   * ['error', 'warn', 'info', 'debug', 'log'].
   * @returns {ContentDeliveryClient}
   *
   * @example
   * // create a ContentDeliveryClient and output logging 'info' messages to the console
   * import { createDeliveryClient } from '@oracle/content-management-sdk';
   * var contentClient = createDeliveryClient({
   *     'contentServer': contentServer,
   *     'channelToken': channelToken,
   *     'logger': {
   *         info: function (message) {
   *             console.log(message);
   *         }
   *     }
   * });
   */
function createDeliveryClient(param) {
  return contentSDK.createDeliveryClient(param);
}

/**
   * Create a client content preview SDK object to interact with draft content
   * in Oracle Content Management:
   * <ul>
   * <li>Authenticated connection to the Content Server.</li>
   * <li>Read content types.</li>
   * <li>Read draft content items.</li>
   * <li>Render draft content using named content layouts.</li>
   * </ul>
   * The content preview client SDK object uses the "/management/" Content REST
   * API calls.  This requires the user to be logged in to the system.
   * @param {object} args - A JavaScript object containing the parameters to create
   * the content delivery client instance.
   * @param {string} [args.contentServer='protocol://host:port'] - URL to the Oracle
   * Content Management instance providing content.  The default assumes the
   * current '<i>protocol</i>://<i>host</i>:<i>port</i>'.
   * @param {('v1' | 'v1.1')} [args.contentVersion='v1.1'] - The version of the
   * content delivery REST API to use.
   * @param {string} args.channelToken - The Oracle Content Management instance
   * token for accessing published content.
   * @param {string} [args.cacheBuster=''] - The URL parameter used to control whether
   * or not content is fetched from the browser cache.
   * @param {boolean} [args.secureContent=false] - Content is secured and requires sign-in to view.
   * @param {string} [args.authorization] - Authorization header to include in the request.
   * @param {function} [args.beforeSend=undefined] - Callback passing in the xhr
   * (browser) or options (NodeJS) object before making the REST call.
   * @param {string} [args.timeout=0] - Timeout for the AJAX calls, defaults to no timeout.
   * @param {object} args.logger - An object that implements the standard log functions:
   * ['error', 'warn', 'info', 'debug', 'log'].
   * @returns {ContentPreviewClient}
   *
   * @example
   * // create a ContentPreviewClient and output logging 'info' messages to the console
   * import { createPreviewClient } from '@oracle/content-management-sdk';
   * var contentClient = createPreviewClient({
   *     'contentServer': contentServer,
   *     'channelToken': channelToken,
   *     'logger': {
   *         info: function (message) {
   *             console.log(message);
   *         }
   *     }
   * });
   */
function createPreviewClient(param) {
  return contentSDK.createPreviewClient(param);
}

export { contentSDK, createDeliveryClient, createPreviewClient };
