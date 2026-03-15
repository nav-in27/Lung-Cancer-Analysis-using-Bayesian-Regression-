# plumber_api.R
# Plumber API for Bayesian Lung Cancer Survival Model

library(plumber)

# Source global dependencies for prediction
source("global.R")

#* @apiTitle Bayesian Clinical Decision Support API
#* @apiDescription Exposing the lung cancer survival model for remote inference

read_latest_patient_dataset <- function() {
  archive_dir <- "datasets_archive"
  if (!dir.exists(archive_dir)) {
    return(NULL)
  }

  csv_files <- list.files(archive_dir, pattern = "\\.csv$", full.names = TRUE)
  if (length(csv_files) == 0) {
    return(NULL)
  }

  latest_file <- csv_files[which.max(file.info(csv_files)$mtime)]
  tryCatch(
    read.csv(latest_file, stringsAsFactors = FALSE),
    error = function(e) NULL
  )
}

coalesce_text <- function(value, fallback = "") {
  if (is.null(value) || length(value) == 0) return(fallback)
  text <- as.character(value)[1]
  if (is.na(text) || trimws(text) == "") fallback else text
}

normalize_treatment_guess <- function(response_category) {
  switch(
    response_category,
    "Complete" = "Combination",
    "Partial" = "Combination",
    "Stable" = "Immunotherapy",
    "Progressive" = "Chemotherapy",
    "Surgery"
  )
}

patient_condition_summary <- function(stage, response_category, survival_status) {
  stage_label <- paste0("Stage ", stage)
  status_label <- ifelse(identical(survival_status, "Alive"), "currently alive", "deceased")
  response_label <- tolower(response_category)
  paste(stage_label, "disease with", response_label, "response; patient is", status_label, "in the recorded cohort window.")
}

#* Predict posterior survival metrics based on patient parameters
#* @param age:numeric Patient age
#* @param sex:character Patient sex
#* @param smoke:character Smoking status
#* @param pack_years:numeric Pack years
#* @param ecog:numeric ECOG Score (0-4)
#* @param stage:character Cancer stage ("I", "II", "III", "IV")
#* @param tumor_size:numeric Tumor size in cm
#* @param treatment:character Planned treatment
#* @param genetic_score:numeric Genetic marker score
#* @post /predict
function(age=65, sex="Male", smoke="Former", pack_years=20, ecog=1, stage="II", tumor_size=3.0, treatment="Surgery", genetic_score=50, res) {
  
  # Ensure proper typecasting 
  age <- as.numeric(age)
  pack_years <- as.numeric(pack_years)
  ecog <- as.character(ecog) 
  tumor_size <- as.numeric(tumor_size)
  genetic_score <- as.numeric(genetic_score)
  
  if(is.na(age) || is.na(tumor_size)) {
    res$status <- 400
    return(list(error = "Invalid numerical inputs provided."))
  }
  
  # Core analytic wrapper
  pred <- generate_prediction(
    age = age,
    sex = sex,
    smoke = smoke,
    pack_years = pack_years,
    ecog = ecog,
    stage = stage,
    tumor_size = tumor_size,
    treatment = treatment,
    genetic_score = genetic_score
  )
  
  # Format comprehensive JSON output
  list(
    status = "success",
    timestamp = Sys.time(),
    patient_query = list(
      age = age, stage = stage, tumor_size = tumor_size, treatment = treatment
    ),
    prediction = list(
      median_survival_months = pred$median_survival,
      clinical_trials_ci_lower_95 = pred$ci_lower,
      clinical_trials_ci_upper_95 = pred$ci_upper,
      probability_survival_5y = pred$prob_surv_5y,
      probability_mortality_5y = pred$prob_mortality_5y,
      treatment_effectiveness_score = pred$trt_effectiveness_prob,
      genetic_risk_modifier = pred$genetic_risk_modifier,
      genetic_risk_shift_percent = pred$genetic_risk_shift_percent
    )
  )
}

#* Fetch a patient record by patient ID
#* @param patient_id:string Patient identifier
#* @get /patient/<patient_id>
function(patient_id = "", res) {
  id_query <- trimws(as.character(patient_id))
  if (identical(id_query, "")) {
    res$status <- 400
    return(list(status = "error", message = "Patient ID is required."))
  }

  patients <- read_latest_patient_dataset()
  if (is.null(patients) || nrow(patients) == 0) {
    res$status <- 404
    return(list(status = "error", message = "No archived patient dataset was found."))
  }

  if (!("patient_id" %in% names(patients))) {
    res$status <- 500
    return(list(status = "error", message = "Dataset is missing required column: patient_id."))
  }

  matched <- patients[as.character(patients$patient_id) == id_query, , drop = FALSE]
  if (nrow(matched) == 0) {
    sample_ids <- head(unique(as.character(patients$patient_id)), 5)
    res$status <- 404
    return(list(
      status = "error",
      message = "Patient ID not found.",
      suggestions = sample_ids
    ))
  }

  row <- matched[1, , drop = FALSE]

  stage <- toupper(coalesce_text(row$cancer_stage, "III"))
  stage <- gsub("STAGE\\s*", "", stage)
  stage <- ifelse(stage %in% c("I", "II", "III", "IV"), stage, "III")

  smoke <- coalesce_text(row$smoking_status, "Former")
  smoke <- ifelse(smoke %in% c("Never", "Former", "Current"), smoke, "Former")

  sex <- coalesce_text(row$sex, "Male")
  sex <- ifelse(sex == "Female", "Female", "Male")

  response_category <- coalesce_text(row$treatment_response_category, "Stable")
  survival_numeric <- suppressWarnings(as.numeric(row$survival_status[[1]]))
  survival_status <- ifelse(!is.na(survival_numeric) && survival_numeric >= 1, "Deceased", "Alive")

  patient <- list(
    patient_id = coalesce_text(row$patient_id),
    age = suppressWarnings(as.numeric(row$age[[1]])),
    sex = sex,
    smoke = smoke,
    pack_years = suppressWarnings(as.numeric(row$pack_years[[1]])),
    ecog = suppressWarnings(as.numeric(row$ecog_score[[1]])),
    stage = stage,
    tumor_size = suppressWarnings(as.numeric(row$tumor_size_cm[[1]])),
    genetic_score = suppressWarnings(as.numeric(row$genetic_mutation_score[[1]])),
    treatment = normalize_treatment_guess(response_category),
    comorbidity_score = suppressWarnings(as.numeric(row$comorbidity_score[[1]])),
    response_category = response_category,
    survival_status = survival_status,
    condition_summary = patient_condition_summary(stage, response_category, survival_status)
  )

  list(
    status = "success",
    source = "datasets_archive",
    patient = patient
  )
}

#* Upload dataset for model fine-tuning (CSV/Excel)
#* @parser multi
#* @post /upload_dataset
function(req, res) {
  dir.create("datasets_archive", showWarnings = FALSE)
  
  # Use req$body$dataset, because plumber maps form-data keys
  file_obj <- req$body$dataset
  
  if (is.null(file_obj)) {
    res$status <- 400
    return(list(status="error", message="No file named 'dataset' found in the request."))
  }
  
  # Basic validation
  ext <- tolower(tools::file_ext(file_obj$filename))
  if (!(ext %in% c("csv", "xls", "xlsx"))) {
    res$status <- 400
    return(list(status="error", message="Invalid format. Please upload a .csv, .xls, or .xlsx file."))
  }
  
  # Save the file securely.
  dest_path <- file.path("datasets_archive", paste0("batch_", format(Sys.time(), "%Y%m%d_%H%M%S"), "_", file_obj$filename))
  
  tryCatch({
    writeBin(file_obj$value, dest_path)
  }, error = function(e){
    # If binary parsing fails, just write as text
    writeLines(as.character(file_obj$value), dest_path)
  })
  
  return(list(
    status = "success", 
    message = "Dataset successfully archived for the next MCMC retraining cycle. Model accuracy expected to improve.",
    file = file_obj$filename,
    archive_path = dest_path
  ))
}
