# OCI registry and Lambda image contract

Policy: <https://github.com/ORESoftware/my-ai/blob/main/AGENTS.md>.

This repository pins registry provisioning to `zed-pkg/zed-infra@698c675f57fd70ebe24a8a08f963599c4c84fa5a` and image publication to `zed-pkg/zed-infra@e0454f5d0d8c970dfa206595a48eda5ead382544` (Git blob `8490ce53434410192c750b10d17fe122e9df30be`). The local wrapper verifies that blob before execution.

ECR, Google Artifact Registry, Azure Container Registry, and R2 are independent, disabled-by-default Terraform choices. Crossplane examples remain unapplied until provider configs, IAM, accounts, regions, cost, retention, and rollback are reviewed.

Portable services may publish an amd64/arm64 image index. AWS Lambda images must set `IMAGE_KIND=lambda` and exactly one platform, `linux/amd64` or `linux/arm64`; invalid Lambda indexes fail before registry authentication or Docker side effects. A `PUSH=false` build loads one local platform and performs no registry login.

The multi-stage templates cover Rust services, Rust custom-runtime Lambda `bootstrap` binaries, and Node `src/lambda` entrypoints. Sibling `*-lambda` repositories can pass their own build context and Dockerfile through the environment-only publisher interface.

R2 is immutable OCI archive/disaster-recovery storage after a successful push to an actual Distribution endpoint. It is not a direct pull registry for Lambda, Cloud Run, Kubernetes, Docker, or containerd.

Validation runs shell parsing, exact publisher verification, Terraform formatting plus real remote-module init/validate, Crossplane parsing, and Dockerfile assertions. Live image publication and Terraform/Crossplane apply remain protected operations and are not performed by this change.
