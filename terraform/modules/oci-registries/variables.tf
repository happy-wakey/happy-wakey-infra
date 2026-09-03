variable "repository_name" {
  description = "Lowercase OCI repository identifier shared where provider naming rules overlap."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$", var.repository_name))
    error_message = "repository_name must be 3-63 lowercase letters, digits, dots, underscores, or hyphens."
  }
}

variable "description" {
  type    = string
  default = "OCI images managed by the product infrastructure repository"
}

variable "tags" {
  type    = map(string)
  default = {}
}

variable "enable_aws_ecr" {
  type    = bool
  default = false
}

variable "enable_gcp_artifact_registry" {
  type    = bool
  default = false
}

variable "enable_azure_acr" {
  type    = bool
  default = false
}

variable "enable_cloudflare_r2_archive" {
  description = "Create an R2 archive bucket. R2 is not a direct runtime OCI registry."
  type        = bool
  default     = false
}

variable "gcp_project_id" {
  type      = string
  default   = null
  nullable  = true
  sensitive = false
}

variable "gcp_location" {
  type    = string
  default = "us-central1"
}

variable "azure_registry_name" {
  type     = string
  default  = null
  nullable = true

  validation {
    condition     = var.azure_registry_name == null || can(regex("^[A-Za-z0-9]{5,50}$", var.azure_registry_name))
    error_message = "azure_registry_name must be 5-50 alphanumeric characters."
  }
}

variable "azure_resource_group_name" {
  type     = string
  default  = null
  nullable = true
}

variable "azure_location" {
  type    = string
  default = "eastus"
}

variable "cloudflare_account_id" {
  type      = string
  default   = null
  nullable  = true
  sensitive = true
}

variable "r2_bucket_name" {
  type     = string
  default  = null
  nullable = true
}

variable "r2_location" {
  type    = string
  default = "enam"
}

variable "r2_jurisdiction" {
  type    = string
  default = "default"
}

variable "r2_storage_class" {
  type    = string
  default = "InfrequentAccess"

  validation {
    condition     = contains(["Standard", "InfrequentAccess"], var.r2_storage_class)
    error_message = "r2_storage_class must be Standard or InfrequentAccess."
  }
}
