/**
 * Copyright (c) 2017, 2023, Oracle and/or its affiliates.
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl/
 */
// jshint ignore: start
/* eslint-disable import/named */
/* eslint-disable class-methods-use-this */
/* eslint-disable max-classes-per-file */
/* eslint-disable prefer-promise-reject-errors */
/* eslint-disable no-prototype-builtins */
/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */
/* eslint-disable no-restricted-syntax */

import {
  isNodeJS, utils, logger, restAPIFactory, requireConfig,
} from './utils';
import TokenManager from './tokenManager';

//
// ------------------------------- Content Client SDK -------------------------------------
//

/**
 * Client object to interact with content published in Oracle Content Management:
 * <ul>
 * <li>Read the published content items</li>
 * <li>Render published content using named content layouts</li>
 * </ul>
 * @alias ContentDeliveryClient
 */
class ContentDeliveryClientImpl {
  /**
   * @param {ClientParameters} args - A JavaScript object containing the parameters
   * to create the content delivery client instance.
   * @returns {ContentDeliveryClient}
   */
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
      authorization: args.authorization,
      tokenManager: new TokenManager(args.authorizationParams, args.authorization),
    };

    // store if running in compiler
    this.isCompiler = args.isCompiler;

    // note supported content types
    this.validContentTypes = ['published'];
    this.validLayoutTypes = this.validContentTypes;

    // define the external API
    this.publicSDK = {
      getInfo: utils.bind(this.getInfo, this),
      getItem: utils.bind(this.getItem, this),
      getItems: utils.bind(this.getItems, this),
      getAuthorizationHeaderValue: utils.bind(this.getAuthorizationHeaderValue, this),
      searchItems: utils.bind(this.queryItems, this),
      queryItems: utils.bind(this.queryItems, this),
      graphql: utils.bind(this.graphql, this),
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

  // Gets the current access token for the impl
  getAuthorizationHeaderValue() {
    return this.info.tokenManager.getAuthValue();
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
   * Content Client Information
   * @typedef {Object} ContentInfo
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

  /**
   * Retrieves the values stored as part of the client object and used on each call.<br/>
   * Once created, these values are immutable for the client instance.
   * @returns {ContentInfo} The information the SDK is using to
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
              `Content Layout: "${args.layout}" does not have a contentVersion specified.
              Assuming data needs to be fetched in "v1.0" format for this Content Layout.
              To avoid this message, add the prototype.contentVersion property to the
              Content Layout Factory object.`,
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
   * If a field that you want to render can contain macros, you can use this
   * utility function to expand the macros.
   *
   * Expand macros are supported in Large Text fields, which work with rich text,
   * but not in Text fields, which contain plain text.
   *
   * This method supports expanding the macro CEC_DIGITAL_ASSET into a rendition URL
   * for a digital asset.  If the asset GUID is followed by ",true" then the URL
   * will be a download URL.</p>
   *
   * @param {string} fieldValue - A field value that may contain macros.
   * @returns {string} The "fieldValue" string with all macros expanded.
   * @example
   * // embed an image asset:
   * contentClient.expandMacros(
   * '<img src="[!--$CEC_DIGITAL_ASSET--]CONTABC123[/!--$CEC_DIGITAL_ASSET--]"/>');
   * @example
   * // A download link:
   * contentClient.expandMacros(
   * '<a href="[!--$CEC_DIGITAL_ASSET--]CONTABC123,true[/!--$CEC_DIGITAL_ASSET--]">Download</a>');
   */
  expandMacros(fieldValue) {
    let afterValue = fieldValue || '';
    logger.log(`expandMacros: beforeValue: ${fieldValue}`);

    // supported macros
    let macros = [
      {
        name: 'DIGITAL_ASSET',
        macro: /\[!--\$CEC_DIGITAL_ASSET--\]*(.*?) *\[\/!--\$CEC_DIGITAL_ASSET--\]/g,
        // eslint-disable-next-line func-names
        value: utils.bind(function (matchString, digitalAssetIDStr) {
          let assetId = digitalAssetIDStr;
          let isDownload = false;
          let idStrParts;

          if (digitalAssetIDStr.indexOf(',')) {
            idStrParts = digitalAssetIDStr.split(',');
            // eslint-disable-next-line prefer-destructuring
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

  /**
   * Get a list of items based on GraphQL POST query.<br/>
   *
   * See GraphQL Explorer: https://[domain]/content/published/api/v1.1/graphql/explorer
   *
   * @param {object} args - A JavaScript object containing the "GraphQL" parameters.
   * @param {string} [args.query=''] - A GraphQL query string to restrict results.
   * @param {function} [args.beforeSend=undefined] - A callback passing in the xhr
   * (browser) or options (node) object before making the REST call.
   * @returns {Promise} A JavaScript Promise object that can be used to retrieve
   *  the data after the call has completed.
   * @example
   * // get the id,name,type of all the items in the publishing channel:
   * contentClient.graphql({
   *     query: '{ getItems(channelToken: "2834f431f8524ffa89dfb7fe77993284")
   *  { items { id name type } } }'
   * }).then(function (response) {
   *     console.log(response);
   * });
   * @example
   * // get the item slug with the corresponding id in a channel:
   * contentClient.graphql({
   *     query: '{ getItem(id:"CORE51A353B7C6AA4EB29C74781FB418C93B",
   *                         channelToken:"546c6bdfe022455db92741407cccded3")
   *   { slug } }'
   * }).then(function (response) {
   *     console.log(response);
   * });
   * @example
   * // get an item by supplying its ID and channel tokens as GraphQL variables:
   * contentClient.graphql({
   *  query: `query ($itemId: ID, $channelToken: String) {
   *            getItem(id: $itemId, channelToken: $channelToken) {
   *              id
   *            }}`,
   *  variables: {
   *    itemId: process.env.VALID_DIGITAL_ASSET_ID_OAUTH,
   *    channelToken: process.env.CHANNEL_TOKEN_OAUTH,
   *  },
   *});
   */
  graphql(params) {
    const self = this;
    const args = params || {};
    const restCallArgs = this.resolveRESTArgs('POST', args);

    // add in the graphQL query POST body
    restCallArgs.postData = {
      query: params.query || params.q,
      variables: params.variables || null,
    };

    logger.debug('ContentClient.graphql: arguments');
    logger.debug(args);

    // setup the search specific arguments
    //  - search does not require management calls so the CSRF
    //  token should not be required for POST requests
    restCallArgs.noCSRFToken = true;

    // format the GraphQL URL:  https://.../content/published/api/v1.1/graphql?cb=<cachebuster>
    const url = self.formatGraphQLURL(restCallArgs);

    return self.restAPI.callRestServer(url, restCallArgs);
  }

  formatGraphQLURL(restArgs) {
    const queryParams = new URLSearchParams();
    if (typeof restArgs.cacheBuster === 'object') {
      queryParams.append('cb', restArgs.cacheBuster.contentKey);
    }
    if (['localhost', '127.0.0.1'].some((host) => restArgs.contentServer.includes(host))) {
      queryParams.append('channelToken', restArgs.channelToken);
    }
    const state = restArgs.contentType === 'preview' ? 'preview' : 'published'; // only 'preview' & 'published' supported by graphQL

    return `${restArgs.contentServer}/content/${state}/api/v1.1/graphql?${queryParams.toString()}`;
  }
}

export default ContentDeliveryClientImpl;
