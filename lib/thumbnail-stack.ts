import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { AnyPrincipal, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { FunctionUrlAuthType, HttpMethod, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { BlockPublicAccess, Bucket, HttpMethods } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import path from 'node:path';

interface ThumbnailStackProps extends StackProps {
  stage: string;
}

export class ThumbnailStack extends Stack {
  constructor(scope: Construct, id: string, props: ThumbnailStackProps) {
    super(scope, id, props);

    const authTypeContext = this.node.tryGetContext('functionUrlAuthType') ?? 'NONE';
    const functionUrlAuthType = authTypeContext === 'AWS_IAM' ? FunctionUrlAuthType.AWS_IAM : FunctionUrlAuthType.NONE;

    const siteBucket = new Bucket(this, 'SiteBucket', {
      autoDeleteObjects: props.stage === 'dev',
      removalPolicy: props.stage === 'dev' ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
      blockPublicAccess: BlockPublicAccess.BLOCK_ACLS,
      publicReadAccess: false,
      websiteIndexDocument: 'index.html',
      cors: [
        {
          allowedMethods: [HttpMethods.GET, HttpMethods.PUT, HttpMethods.HEAD],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3000
        }
      ]
    });

    siteBucket.addToResourcePolicy(
      new PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [
          siteBucket.arnForObjects('index.html'),
          siteBucket.arnForObjects('app.js'),
          siteBucket.arnForObjects('styles.css'),
          siteBucket.arnForObjects('config.json')
        ],
        principals: [new AnyPrincipal()]
      })
    );

    const handler = new NodejsFunction(this, 'ThumbnailHandler', {
      runtime: Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '..', 'lambda', 'src', 'handler.ts'),
      handler: 'handler',
      timeout: Duration.seconds(20),
      memorySize: 1024,
      bundling: {
        forceDockerBundling: true,
        nodeModules: ['sharp', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner']
      },
      environment: {
        BUCKET_NAME: siteBucket.bucketName,
        UPLOAD_PREFIX: 'uploads/',
        THUMB_PREFIX: 'thumb/',
        ALLOWED_ORIGIN: '*'
      }
    });

    handler.addToRolePolicy(
      new PolicyStatement({
        actions: ['s3:PutObject'],
        resources: [siteBucket.arnForObjects('uploads/*'), siteBucket.arnForObjects('thumb/*')]
      })
    );
    handler.addToRolePolicy(
      new PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [siteBucket.arnForObjects('uploads/*')]
      })
    );

    const fnUrl = handler.addFunctionUrl({
      authType: functionUrlAuthType,
      cors: {
        allowedHeaders: ['content-type'],
        allowedMethods: [HttpMethod.GET, HttpMethod.POST, HttpMethod.OPTIONS],
        allowedOrigins: ['*']
      }
    });

    new BucketDeployment(this, 'DeployFrontend', {
      destinationBucket: siteBucket,
      sources: [Source.asset(path.join(__dirname, '..', 'frontend')), Source.jsonData('config.json', { functionUrl: fnUrl.url })]
    });

    new CfnOutput(this, 'WebsiteUrl', { value: siteBucket.bucketWebsiteUrl });
    new CfnOutput(this, 'FunctionUrl', { value: fnUrl.url });
    new CfnOutput(this, 'BucketName', { value: siteBucket.bucketName });
  }
}
