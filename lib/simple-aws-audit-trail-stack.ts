import * as cdk from "aws-cdk-lib";
import { Duration } from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kinesis from "aws-cdk-lib/aws-kinesis";
import * as kinesisfirehose from "aws-cdk-lib/aws-kinesisfirehose";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export class SimpleAwsAuditTrailStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const auditTrailStream = new kinesis.Stream(this, "AuditTrailStream", {
      
    });

    new dynamodb.Table(this, "TableToAudit", {
      tableName: `TableToAudit`,
      partitionKey: {
        name: "partitionKey",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "sortKey",
        type: dynamodb.AttributeType.STRING,
      },
      kinesisStream: auditTrailStream,
    });

    const auditTrailBucket = new s3.Bucket(this, "AuditTrailDestination", {
      lifecycleRules: [
        {
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: Duration.days(30),
            },
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: Duration.days(60),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: Duration.days(90),
            },
            {
              storageClass: s3.StorageClass.DEEP_ARCHIVE,
              transitionAfter: Duration.days(180),
            },
          ],
        },
      ],
    });

    const deliveryRole = new iam.Role(this, "deliveryRole", {
      assumedBy: new iam.ServicePrincipal("firehose.amazonaws.com"),
      inlinePolicies: {
        s3: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              resources: [
                `arn:aws:s3:::${auditTrailBucket.bucketName}`,
                `arn:aws:s3:::${auditTrailBucket.bucketName}/*`,
              ],
              actions: [
                "s3:AbortMultipartUpload",
                "s3:GetBucketLocation",
                "s3:GetObject",
                "s3:ListBucket",
                "s3:ListBucketMultipartUploads",
                "s3:PutObject",
              ],
            }),
          ],
        }),
        kinesis: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              resources: [auditTrailStream.streamArn],
              actions: [
                "kinesis:DescribeStream",
                "kinesis:GetShardIterator",
                "kinesis:GetRecords",
                "kinesis:ListShards",
              ],
            }),
          ],
        }),
        logs: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              resources: ["*"],
              actions: ["logs:PutLogEvents"],
            }),
          ],
        }),
      },
    });

    new kinesisfirehose.CfnDeliveryStream(this, "AuditTrailDeliveryStream", {
      deliveryStreamType: "KinesisStreamAsSource",
      kinesisStreamSourceConfiguration: {
        roleArn: deliveryRole.roleArn,
        kinesisStreamArn: auditTrailStream.streamArn,
      },
      s3DestinationConfiguration: {
        bucketArn: auditTrailBucket.bucketArn,
        roleArn: deliveryRole.roleArn,
      },
    });
  }
}
