/**
 * Copyright (c) 2017, 2022, Oracle and/or its affiliates.
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl/
 */
// jshint ignore: start
/* eslint-disable class-methods-use-this */
/* eslint-disable max-classes-per-file */
/* eslint-disable prefer-promise-reject-errors */
/* eslint-disable no-prototype-builtins */
/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */
/* eslint-disable no-restricted-syntax */

// Detect whether we're running in a browser or in NodeJS.
// Note that some other environments (e.g. React-Native) are not detected and may not
// work properly.
const isNodeJS = typeof window === 'undefined' && typeof process === 'object';

//
// ------------------------------- Cross-browser Utility functions ---------------------
//
const utils = {
  bind(func, owner) {
    // eslint-disable-next-line func-names
    return function (...args) {
      return func.apply(owner, args);
    };
  },
  extend(dest, orig) {
    for (const prop in orig) {
      if (orig.hasOwnProperty(prop)) {
        // eslint-disable-next-line no-param-reassign
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
        'ContentClient.renderLayout: Unable to render the layout. Ensure you can access the layout: If published, that the layout has been published. If draft, that you are logged onto the Sites server',
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
    const url = require('url');

    const token = restArgs.tokenManager !== null && restArgs.tokenManager !== undefined
      ? await restArgs.tokenManager.getAuthValue() : restArgs.authorization;

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
          // eslint-disable-next-line import/no-unresolved
          // eslint-disable-next-line import/no-extraneous-dependencies
          const HttpsProxyAgent = require('https-proxy-agent');
          logger.debug('Loaded proxy agent');
          const agent = new HttpsProxyAgent(proxy);
          logger.debug(`Using proxy: ${proxy} connecting to ${targetURL}`);
          options.agent = agent;
        } catch (e) {
          logger.warn(
            `Could not initialize https-proxy-agent. Is the package installed in your application?.
            Making direct call to ${targetURL}`,
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
              logger.debug(jsonResponse);
              resolve(jsonResponse);
            } catch (e) {
              reject({
                error: body,
              });
            }
          } else {
            // return the error response object to be handled by calling function
            logger.debug(`HTTP call failed.  Response code ${responseStatus}\n${body}`);
            reject(response);
          }
        });
      };

      // store the call type in options
      options.method = restArgs.method.toUpperCase() || '';
      options.headers = {};
      if (token && token !== '') {
        options.headers.Authorization = token;
      }

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
        options.headers['Content-Type'] = 'application/json';
        options.headers['X-Requested-With'] = 'XMLHttpRequest';
        options.headers['Content-Length'] = bodyString.length;

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
          statusText: `Expected to see arguments:
          { "method": "GET/POST/PUT/DELETE", "url": url } but received: ${JSON.stringify(
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
    preview: 'preview',
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
      `Content SDK: "${caller}" has unrecognized Content Version: "${requestedVersion}".
      Defaulting to: version="${
  this.defaultVersion
}".
To avoid this message, use one of the supported versions when creating a content client: 
${JSON.stringify(
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
              // eslint-disable-next-line no-param-reassign
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

class OptionsValidation {
  // Supported configurations
  static deliveryREST = 'deliveryREST';

  static previewREST = 'previewREST';

  static managementREST = 'managementREST';

  // A function to validate some of the options being passed into the SDK
  static processOptions(options) {
    const validDeliveryOptions = [OptionsValidation.deliveryREST];
    const validPreviewOptions = [OptionsValidation.previewREST, OptionsValidation.managementREST];

    const defaultOptions = {
      deliveryClientAPI: OptionsValidation.deliveryREST,
      previewClientAPI: OptionsValidation.managementREST,
    };

    if (options && typeof options === 'object') {
      // Value unspecified. Use default
      if (!options.deliveryClientAPI) {
        // eslint-disable-next-line no-param-reassign
        options.deliveryClientAPI = defaultOptions.deliveryClientAPI;
      } else if (!validDeliveryOptions.includes(options.deliveryClientAPI)) {
        throw new Error("options.deliveryClientAPI is invalid. It may only be set to 'deliveryREST'");
      }
      // Value unspecified. Use default
      if (!options.previewClientAPI) {
        // eslint-disable-next-line no-param-reassign
        options.previewClientAPI = OptionsValidation.previewREST;
      } else if (!validPreviewOptions.includes(options.previewClientAPI)) {
        throw new Error("options.previewClientAPI is invalid. It may only be set to 'previewREST' or 'managementREST'");
      }
      return options;
    }
    return defaultOptions;
  }
}

export {
  isNodeJS, utils, logger, restAPIFactory, requireConfig, OptionsValidation,
};
