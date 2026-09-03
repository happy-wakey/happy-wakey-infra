terraform {
  required_version = ">= 1.7.0"
}

locals {
  registry_modules_commit = "698c675f57fd70ebe24a8a08f963599c4c84fa5a"
}

module "aws_ecr" {
  count  = var.enable_aws_ecr ? 1 : 0
  source = "git::https://github.com/zed-pkg/zed-infra.git//terraform/modules/oci-registry-fleet/aws-ecr?ref=698c675f57fd70ebe24a8a08f963599c4c84fa5a"

  repository_name = var.repository_name
  oci_role        = "lambda"
  tags            = var.tags
}

module "gcp_artifact_registry" {
  count  = var.enable_gcp_artifact_registry ? 1 : 0
  source = "git::https://github.com/zed-pkg/zed-infra.git//terraform/modules/oci-registry-fleet/gcp-artifact-registry?ref=698c675f57fd70ebe24a8a08f963599c4c84fa5a"

  project_id    = coalesce(var.gcp_project_id, "disabled-project")
  location      = var.gcp_location
  repository_id = var.repository_name
  description   = var.description
  oci_role      = "cloud-run"
  labels = {
    managed-by = "terraform"
    oci-role   = "cloud-run"
  }
}

module "azure_acr" {
  count  = var.enable_azure_acr ? 1 : 0
  source = "git::https://github.com/zed-pkg/zed-infra.git//terraform/modules/oci-registry-fleet/azure-acr?ref=698c675f57fd70ebe24a8a08f963599c4c84fa5a"

  registry_name       = coalesce(var.azure_registry_name, "disabledregistry")
  resource_group_name = coalesce(var.azure_resource_group_name, "disabled-resource-group")
  location            = var.azure_location
  sku                 = "Basic"
  oci_role            = "azure-mirror"
  tags                = var.tags
}

module "cloudflare_r2_archive" {
  count  = var.enable_cloudflare_r2_archive ? 1 : 0
  source = "git::https://github.com/zed-pkg/zed-infra.git//terraform/modules/oci-registry-fleet/cloudflare-r2?ref=698c675f57fd70ebe24a8a08f963599c4c84fa5a"

  account_id    = coalesce(var.cloudflare_account_id, "disabled-account")
  bucket_name   = coalesce(var.r2_bucket_name, "disabled-oci-archive")
  location      = var.r2_location
  jurisdiction  = var.r2_jurisdiction
  storage_class = var.r2_storage_class
}

check "provider_specific_inputs" {
  assert {
    condition = !var.enable_gcp_artifact_registry || (
      trimspace(coalesce(var.gcp_project_id, "")) != ""
    )
    error_message = "gcp_project_id is required when enable_gcp_artifact_registry is true."
  }

  assert {
    condition = !var.enable_azure_acr || (
      trimspace(coalesce(var.azure_registry_name, "")) != "" &&
      trimspace(coalesce(var.azure_resource_group_name, "")) != ""
    )
    error_message = "azure_registry_name and azure_resource_group_name are required when enable_azure_acr is true."
  }

  assert {
    condition = !var.enable_cloudflare_r2_archive || (
      trimspace(coalesce(var.cloudflare_account_id, "")) != "" &&
      trimspace(coalesce(var.r2_bucket_name, "")) != ""
    )
    error_message = "cloudflare_account_id and r2_bucket_name are required when enable_cloudflare_r2_archive is true."
  }
}
