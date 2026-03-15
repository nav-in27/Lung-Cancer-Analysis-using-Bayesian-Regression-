ui <- page_navbar(
  title = span(icon("laptop-medical"), " Bayesian Clinical Decision Support: Lung Cancer"),
  theme = bs_theme(
    version = 5,
    bootswatch = "flatly",
    primary = "#2C3E50", 
    secondary = "#18BC9C",
    success = "#28A745",
    info = "#17A2B8",
    base_font = font_google("Inter"),
    heading_font = font_google("Inter")
  ),
  tags$head(
    tags$link(rel = "stylesheet", type = "text/css", href = "styles.css")
  ),
  sidebar = sidebar(
    width = 350,
    title = "Patient Parameters",
    accordion(
      accordion_panel(
        "Demographics",
        icon = icon("user"),
        numericInput("age", "Age", value = 65, min = 18, max = 100),
        selectInput("sex", "Sex", choices = c("Male", "Female")),
        selectInput("smoke", "Smoking Status", choices = c("Never", "Former", "Current")),
        numericInput("pack_years", "Pack Years", value = 0, min = 0)
      ),
      accordion_panel(
        "Clinical Status",
        icon = icon("heartbeat"),
        selectInput("ecog", "ECOG Performance Status", choices = 0:4),
        selectInput("stage", "Cancer Stage", choices = c("I", "II", "III", "IV")),
        numericInput("tumor_size", "Tumor Size (cm)", value = 3.0, min = 0.1, step = 0.1),
        numericInput("genetic_score", "Genetic Marker Score (0-100)", value = 50, min = 0, max = 100)
      ),
      accordion_panel(
        "Treatment Strategy",
        icon = icon("pills"),
        selectInput("treatment", "Planned Treatment", 
                    choices = c("Surgery", "Chemotherapy", "Radiation", 
                                "Immunotherapy", "Targeted Therapy", "Combination"))
      )
    ),
    br(),
    actionButton("predict_btn", "Run Bayesian Inference", class = "btn-primary btn-lg w-100", icon = icon("calculator"))
  ),
  
  nav_panel("Dashboard", icon = icon("chart-line"),
    layout_columns(
      fill = FALSE,
      value_box(
        title = "Posterior Median Survival",
        value = textOutput("vb_median_surv"),
        p("Months (95% CI)"),
        showcase = icon("clock"),
        theme = "primary"
      ),
      value_box(
        title = "5-Year Survival Probability",
        value = textOutput("vb_prob_surv"),
        p("Posterior Estimate"),
        showcase = icon("heartbeat"),
        theme = "success"
      ),
      value_box(
        title = "Treatment Effectiveness",
        value = textOutput("vb_trt_eff"),
        p("Probability > Standard Care"),
        showcase = icon("shield-alt"),
        theme = "info"
      )
    ),
    
    card(
      card_header("Predictive Analytics"),
      layout_columns(
        col_widths = c(6, 6),
        card(
          card_header("Posterior Survival Curve"),
          plotlyOutput("surv_curve_plot")
        ),
        card(
          card_header("Posterior Distribution of Survival Time"),
          plotlyOutput("posterior_dist_plot")
        )
      )
    ),
    layout_columns(
      col_widths = c(6, 6),
      card(
         card_header("Survival Probability Gauge"),
         plotlyOutput("gauge_plot")
      ),
      card(
         card_header("Treatment Comparison Ranking"),
         plotlyOutput("trt_comp_plot")
      )
    )
  ),

  nav_panel("Patient Monitoring", icon = icon("notes-medical"),
    card(
      card_header("Longitudinal Patient Monitoring Timeline"),
      layout_columns(
        col_widths = c(4, 8),
        card(
          card_header("Monitoring Controls"),
          selectInput("patient_monitor_id", "Select patient_id", choices = NULL),
          p("Track tumor size, ECOG score, and treatment response progression across follow-up visits.")
        ),
        card(
          card_header("Clinical Timeline"),
          plotlyOutput("patient_timeline_plot")
        )
      )
    ),
    card(
      card_header("Visit-Level Clinical Log"),
      DTOutput("patient_visit_table")
    )
  ),

  nav_panel("Treatment Simulator", icon = icon("microscope"),
    layout_columns(
      fill = FALSE,
      value_box(
        title = "Best Treatment Option",
        value = textOutput("best_treatment_text"),
        p("Highest projected 5-year survival"),
        showcase = icon("award"),
        theme = "success"
      ),
      value_box(
        title = "Predicted 5-Year Survival",
        value = textOutput("best_survival_text"),
        p("Posterior mean estimate"),
        showcase = icon("chart-area"),
        theme = "info"
      ),
      value_box(
        title = "Expected Survival Ranking",
        value = textOutput("ranking_summary_text"),
        p("Across chemotherapy, radiation, surgery, immunotherapy"),
        showcase = icon("list-ol"),
        theme = "primary"
      )
    ),
    card(
      card_header("Treatment Outcome Simulator"),
      plotlyOutput("treatment_sim_plot")
    ),
    layout_columns(
      col_widths = c(7, 5),
      card(
        card_header("Survival Projection Over Time"),
        plotlyOutput("survival_projection_plot")
      ),
      card(
        card_header("Patient Risk Gauge"),
        plotlyOutput("risk_gauge_large")
      )
    ),
    card(
      card_header("AI Prediction Explanation"),
      uiOutput("ai_explanation_ui")
    )
  ),
  
  nav_panel("Model Diagnostics", icon = icon("stethoscope"),
    card(
      card_header("MCMC Diagnostics & Uncertainty"),
      markdown("
        **Bayesian Model Uncertainty**
        
        The predictions provided are derived from the posterior predictive distribution of the *stan_surv* model. 
        Unlike frequentist point estimates, Bayesian inference provides a full probability distribution for the expected survival, capturing parameter uncertainty naturally.
        
        **Model Details**
        - **Engine:** rstanarm
        - **Chains:** 4
        - **Iterations:** 4,000
        
        *Ensure that the `bayesian_survival_model.rds` file is placed in the app directory to use actual patient data; otherwise, an internal simulation runs dynamically to replicate the architecture.*
      "),
      plotlyOutput("diag_plot") 
    )
  ),
  
  nav_panel("Reports & Export", icon = icon("file-export"),
    card(
      card_header("Export Patient Data & Predictions"),
      p("Generate a comprehensive PDF medical report or export the predicted posterior metrics to CSV for external clinical analysis."),
      downloadButton("export_csv", "Export Results (CSV)", class = "btn-success"),
      br(),br(),
      downloadButton("export_pdf", "Generate Clinical Report (PDF)", class = "btn-danger")
    )
  )
)
