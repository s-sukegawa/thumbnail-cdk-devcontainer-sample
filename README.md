# thumbnail-cdk-devcontainer-sample

AWS CDK (TypeScript) で、以下の構成を作るサンプルです。

- S3 静的サイト (`index.html`) を公開
- フロントから PNG を選択
- Lambda Function URL で `presign` API を呼び、S3 `uploads/` への署名付き PUT URL を取得
- S3へアップロード後、Lambda Function URL の `thumbnail` API を呼ぶ
- Lambda (Node.js + sharp) が `uploads/` のPNGをサムネ化し `thumb/` へ保存

## 構成図

```text
[Browser: index.html]
   | (1) POST /presign
   v
[Lambda Function URL] --(署名付きURL返却)--> Browser
   ^
   | (3) POST /thumbnail {key}
   |
Browser --(2) PUT with signed URL--> [S3 bucket: uploads/]
Lambda --(4) Get uploads/*, Put thumb/*--> [S3 bucket]
```

## 実装方針（なぜこの方式か）

アップロード方式は **署名付きURL方式** を採用しました。

理由:

1. ブラウザから直接S3へアップロードでき、Lambda経由アップロードより転送コストと待ち時間を削減できる
2. IAM 権限を `uploads/*` に限定しやすく、最小権限を保ちやすい
3. CORS をS3側で明示し、Function URL 側も CORS を返すことで実運用に近い形になる

## ディレクトリ

- `lib/thumbnail-stack.ts`: CDKスタック
- `lambda/src/handler.ts`: `presign` / `thumbnail` API
- `lambda/src/thumbnail.ts`: サムネ生成ロジック（ユニットテスト対象）
- `frontend/`: S3に配布する静的サイト
- `.devcontainer/devcontainer.json`: DevContainer定義（docker compose未使用）
- `.github/workflows/*.yml`: CI/CD

## 前提

- Node.js 20
- AWS CDK v2
- AWSアカウント
- （ローカル synth 時）Docker  
  `sharp` を Lambda Linux 向けでバンドルするため、CDK NodejsFunction を Docker バンドルしています。

## DevContainer

このリポジトリは `.devcontainer/devcontainer.json` のみで完結します。

1. VS Code で `Reopen in Container`
2. `postCreateCommand` で `npm ci` 実行

## デプロイ手順

```bash
npm ci
npm test
npm run synth -- -c stage=dev
npx cdk bootstrap
npx cdk deploy --require-approval never -c stage=dev
```

`stage` は `dev` / `stg` を想定しています。

## Function URL 認可

初期値は `NONE` です。以下で `AWS_IAM` に切り替えできます。

```bash
npx cdk deploy -c stage=dev -c functionUrlAuthType=AWS_IAM
```

## IAM最小権限

Lambda 実行ロール:

- `s3:GetObject` on `uploads/*`
- `s3:PutObject` on `uploads/*`, `thumb/*`

バケットポリシー:

- 静的サイト配信用の `index.html`, `app.js`, `styles.css`, `config.json` のみ `GetObject` を公開
- `uploads/*`, `thumb/*` は公開しない

## テスト

```bash
npm test
```

`lambda/src/thumbnail.ts` のサムネ生成ロジックを最小ユニットテストしています。

## GitHub Actions

### CI (`.github/workflows/ci.yml`)

- `npm ci`
- `npm test`
- `cdk synth`

### Deploy (`.github/workflows/deploy.yml`)

- `main` push で `dev/stg` へ deploy
- OIDC で AWS AssumeRole
- 必要な GitHub Variables（Secrets最小）:
  - `AWS_ROLE_ARN_DEV`
  - `AWS_ROLE_ARN_STG`
  - `AWS_REGION` (任意、未指定時 `ap-northeast-1`)

## 注意点

- Function URL が `NONE` の場合、誰でも呼べるため公開範囲に注意
- 画像処理は `sharp` のため、依存解決に Docker バンドルを利用
- 本番運用時は CloudFront + WAF、Function URL の IAM 認可化、アップロードサイズ制限などを検討
