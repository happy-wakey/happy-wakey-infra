# OCI image build, registry and Lambda contract

Policy source: <https://github.com/ORESoftware/my-ai/blob/main/AGENTS.md>.

Deployable images must live in an actual OCI/Docker Registry API endpoint: AWS ECR for Lambda/ECS/EKS, Google Artifact Registry for Cloud Run/GKE, Azure Container Registry for Container Apps/AKS, or Docker Hub where its plan fits. Cloudflare R2 is deliberately an immutable OCI archive/DR copy, not a direct runtime registry.

`scripts/oci/build-and-push.sh` uses environment variables so credentials never appear in argv. It supports `aws-ecr`, `dockerhub`, `gcp-artifact-registry`, `azure-acr`, and an already-authenticated custom registry (`none`). Prefer OIDC/workload identity and standard credential helpers.

For a Rust service use `docker/Dockerfile.rust-service` with `BUILD_ARG_NAMES=SERVICE_BIN`. For a Rust Lambda from a `*-lambda` repository or `src/lambda`, use `docker/Dockerfile.rust-lambda` with `BUILD_ARG_NAMES=LAMBDA_BIN`. For Node use `docker/Dockerfile.node-lambda`; it copies `src/lambda` by default.

Default publication is `linux/amd64,linux/arm64` with SBOM and provenance. `PUSH=false` permits one platform only. Set `R2_ARCHIVE_BUCKET`, `R2_ENDPOINT`, and optional `R2_ARCHIVE_PREFIX` after a real-registry push to export a complete `oci-archive` with `skopeo --all` and upload it plus a SHA-256 sidecar to R2.

`terraform/modules/oci-registries` creates any reviewed subset of ECR, GAR, ACR and an R2 archive bucket. Docker Hub account policy remains account-managed. Crossplane examples stay unapplied until provider configs, names, projects and regions are reviewed.
