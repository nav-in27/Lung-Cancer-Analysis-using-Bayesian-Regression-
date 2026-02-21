# run_api.R
# Execute this script to start the Plumber REST API server

library(plumber)

pr("plumber_api.R") %>%
  pr_run(port=8000)
