# About Oracle Content Management - Content SDK (JavaScript)

The Content SDK for Oracle Content Management is a light-weight JavaScript wrapper that interacts with the Content REST APIs. This read-only SDK retrieves structured content, digital assets and content layouts that are managed in Oracle Content Management. The SDK allows you to write a web application that is content rich - allowing the use of Oracle Content Management for content management, authoring and approval and delivery from your own web server.

The SDK consists of three main classes:

- contentSDK: The main entry-point object. The contentSDK object lets you create client objects to access content based on your requirements.
- ContentDeliveryClient : A client object that is set up to access published content items and digital assets.
- ContentPreviewClient : A client object that is set up to access content types, draft content items, and draft digital assets.

## Installation

Prerequisite: node.js 10.9.0 or later, and node and npm on your path.

```shell
npm install @oracle/content-management-sdk
```

## Documentation

- [Developing for Oracle Content Management](https://docs.oracle.com/en/cloud/paas/content-cloud/developer/content-sdk.html)
- [JS Doc](https://docs.oracle.com/en/cloud/paas/content-cloud/sdk-content-delivery/ContentSDK.html)

### Examples

> NOTE: The SDK must be initialized with the URL of your content service.  The URL uses the pattern `https://<service-name>-<account-name>.cec.ocp.oraclecloud.com` and can be given to you by your Oracle Content Management service administrator.

#### Using the SDK in NodeJS with ES6 import

```javascript
// Imports the contentSDK class. You could import the createDeliveryClient or createPreviewClient functions instead.
import { contentSDK }  from '@oracle/content-management-sdk';

const contentDeliveryClient = contentSDK.createDeliveryClient({
  contentServer: 'https://<service-name>-<account-name>.cec.ocp.oraclecloud.com',
  contentVersion: 'v1.1',
  channelToken: '<token>', // Use your published channel token
  logger: console,
});

// Perform a load of an asset
contentDeliveryClient.getItem(....);
```

#### Using the SDK in NodeJS with require

```javascript
// Imports the contentSDK class. You could import the createDeliveryClient or createPreviewClient functions instead.
const { contentSDK } = require('@oracle/content-management-sdk');

const contentDeliveryClient = contentSDK.createDeliveryClient({
  contentServer: 'https://<service-name>-<account-name>.cec.ocp.oraclecloud.com',
  contentVersion: 'v1.1',
  channelToken: '<token>', // Use your published channel token
  logger: console,
});

// Perform a load of an asset
contentDeliveryClient.getItem(....);
```

#### Using the SDK with import in an HTML page  

```javascript
<html>  
  <head>  
    <script type="module">
      import {createDeliveryClient} from 'path_to_expanded_contentsdk_package/content.umd.js';
      const client=createDeliveryClient({  
        contentServer: 'https://<service-name>-<account-name>.cec.ocp.oraclecloud.com',  
        contentVersion: 'v1.1',  
        channelToken: '<token>',
        logger: console,  
      });  
      client.getItem(....);
    </script>  
  </head>  
  <body>  
  </body>  
</html>  
```

#### Loading the SDK via a script tag

```javascript
<html>
  <head>
      <title>Using Content SDK</title>
      <script src="url_of_expanded_contentsdk_package/content.umd.js"></script>
  </head>
  <body>
    <script>
      const client = contentsdk.createDeliveryClient({
        contentServer: 'https://<service-name>-<account-name>.cec.ocp.oraclecloud.com',
        contentVersion: 'v1.1',
        channelToken: '<token>',
        logger: console,
      });
      client.getItem(....);
    </script>
  </body>
</html>
```

#### Sample Projects

For more examples, check out our open source [sample projects](https://docs.oracle.com/en/cloud/paas/content-cloud/samples.html).

## Contributing

This project welcomes contributions from the community. Before submitting a pull
request, please [review our contribution guide](./CONTRIBUTING.md).

## Security

Please consult the [security guide](./SECURITY.md) for our responsible security
vulnerability disclosure process.

## License

Copyright (c) 2017, 2021 Oracle and/or its affiliates.

Released under the Universal Permissive License v1.0 as shown at
<https://oss.oracle.com/licenses/upl/>.
