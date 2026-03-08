# run_api.R
# Execute this script to start the Plumber REST API server

library(plumber)

port_from_env <- suppressWarnings(as.integer(Sys.getenv("R_PLUMBER_PORT", "8000")))
if (is.na(port_from_env) || port_from_env < 1 || port_from_env > 65535) {
  port_from_env <- 8000
}

pr("plumber_api.R") %>%
  pr_run(host = "127.0.0.1", port = port_from_env)
