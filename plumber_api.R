# plumber_api.R
# Plumber API for Bayesian Lung Cancer Survival Model

library(plumber)

# Source global dependencies for prediction
source("global.R")

#* @apiTitle Bayesian Clinical Decision Support API
#* @apiDescription Exposing the lung cancer survival model for remote inference

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
      treatment_effectiveness_score = pred$trt_effectiveness_prob
    )
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
