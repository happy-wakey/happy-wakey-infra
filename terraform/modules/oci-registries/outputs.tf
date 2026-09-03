output "registry_modules_commit" {
  description = "Exact merged zed-infra commit supplying the provider-specific modules."
  value       = local.registry_modules_commit
}

output "aws_ecr_repository_url" {
  value = try(module.aws_ecr[0].repository_url, null)
}

output "gcp_artifact_registry_host" {
  value = var.enable_gcp_artifact_registry ? "${var.gcp_location}-docker.pkg.dev" : null
}

output "gcp_artifact_registry_repository" {
  value = try(module.gcp_artifact_registry[0].docker_repository, null)
}

output "azure_acr_login_server" {
  value = try(module.azure_acr[0].login_server, null)
}

output "cloudflare_r2_archive_bucket" {
  value = try(module.cloudflare_r2_archive[0].bucket_name, null)
}

output "cloudflare_r2_direct_oci_registry" {
  description = "Always false: R2 is archive/blob storage, not an OCI Distribution endpoint."
  value       = false
}
