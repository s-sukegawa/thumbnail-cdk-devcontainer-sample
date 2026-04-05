#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { ThumbnailStack } from '../lib/thumbnail-stack.js';

const app = new App();
const stage = app.node.tryGetContext('stage') ?? process.env.STAGE ?? 'dev';

new ThumbnailStack(app, `ThumbnailStack-${stage}`, {
  stage,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-1'
  }
});
