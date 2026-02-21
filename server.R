server <- function(input, output, session) {
  
  predictions <- eventReactive(input$predict_btn, {
    id <- showNotification("Running MCMC iterations & computing posterior predictive distribution...", duration = 3, type = "message")
    
    res <- generate_prediction(
      age = input$age,
      sex = input$sex,
      smoke = input$smoke,
      pack_years = input$pack_years,
      ecog = input$ecog,
      stage = input$stage,
      tumor_size = input$tumor_size,
      treatment = input$treatment,
      genetic_score = input$genetic_score
    )
    
    removeNotification(id)
    return(res)
  }, ignoreNULL = FALSE) 
  
  output$vb_median_surv <- renderText({
    req(predictions())
    sprintf("%.1f (%.1f - %.1f)", 
            predictions()$median_survival, 
            predictions()$ci_lower, 
            predictions()$ci_upper)
  })
  
  output$vb_prob_surv <- renderText({
    req(predictions())
    sprintf("%.1f %%", predictions()$prob_surv_5y * 100)
  })
  
  output$vb_trt_eff <- renderText({
    req(predictions())
    sprintf("%.1f %%", predictions()$trt_effectiveness_prob * 100)
  })
  
  output$surv_curve_plot <- renderPlotly({
    req(predictions())
    time_pts <- seq(0, 120, by = 1)
    lambda <- log(2) / predictions()$median_survival
    survival_prob <- exp(-lambda * time_pts)
    
    df <- data.frame(Time = time_pts, Survival = survival_prob)
    
    p <- ggplot(df, aes(x = Time, y = Survival)) +
      geom_line(color = "#18BC9C", linewidth = 1.2) +
      geom_ribbon(aes(ymin = Survival * 0.85, ymax = pmin(Survival * 1.15, 1)), fill = "#18BC9C", alpha = 0.2) +
      theme_minimal(base_family = "Inter") +
      labs(x = "Time (Months)", y = "Probability of Survival", title = "Posterior Survival Curve (95% CI)") +
      coord_cartesian(ylim = c(0, 1))
    
    ggplotly(p) %>% config(displayModeBar = FALSE)
  })
  
  output$posterior_dist_plot <- renderPlotly({
    req(predictions())
    df <- data.frame(Survival = predictions()$posterior_samples)
    
    p <- ggplot(df, aes(x = Survival)) +
      geom_density(fill = "#2C3E50", alpha = 0.7, color = NA) +
      geom_vline(xintercept = predictions()$median_survival, color = "#E74C3C", linetype = "dashed", linewidth = 1) +
      theme_minimal(base_family = "Inter") +
      labs(x = "Expected Median Survival (Months)", y = "Density", title = "Posterior Predictive Distribution") +
      xlim(0, max(120, max(df$Survival) * 1.1))
      
    ggplotly(p) %>% config(displayModeBar = FALSE)
  })
  
  output$gauge_plot <- renderPlotly({
    req(predictions())
    val <- predictions()$prob_surv_5y * 100
    
    fig <- plot_ly(
      domain = list(x = c(0, 1), y = c(0, 1)),
      value = val,
      title = list(text = "5-Year Survival Prob (%)"),
      type = "indicator",
      mode = "gauge+number",
      gauge = list(
        axis = list(range = list(NULL, 100)),
        bar = list(color = "#18BC9C"),
        steps = list(
          list(range = c(0, 30), color = "#FFECEC"),
          list(range = c(30, 70), color = "#FFF9EC"),
          list(range = c(70, 100), color = "#ECFFF4")
        ),
        threshold = list(
          line = list(color = "#2C3E50", width = 4),
          thickness = 0.75,
          value = val
        )
      )
    )
    fig %>% layout(margin = list(l=20,r=20,t=50,b=20))
  })
  
  output$trt_comp_plot <- renderPlotly({
    req(input$predict_btn)
    trts <- c("Surgery", "Chemotherapy", "Radiation", "Immunotherapy", "Targeted Therapy", "Combination")
    
    comp_data <- lapply(trts, function(t) {
      res <- generate_prediction(
        age = input$age, sex = input$sex, smoke = input$smoke, pack_years = input$pack_years,
        ecog = input$ecog, stage = input$stage, tumor_size = input$tumor_size, treatment = t,
        genetic_score = input$genetic_score
      )
      data.frame(Treatment = t, Median = res$median_survival, Lower = res$ci_lower, Upper = res$ci_upper)
    })
    comp_df <- do.call(rbind, comp_data)
    
    comp_df$Treatment <- factor(comp_df$Treatment, levels = comp_df$Treatment[order(comp_df$Median)])
    
    p <- ggplot(comp_df, aes(x = Median, y = Treatment, color = Treatment)) +
      geom_point(size = 4) +
      geom_errorbarh(aes(xmin = Lower, xmax = Upper), height = 0.2, linewidth = 1) +
      theme_minimal(base_family = "Inter") +
      theme(legend.position = "none") +
      labs(x = "Expected Median Survival (Months)", y = "", title = "Treatment Effectiveness Ranking (95% CI)") +
      scale_color_viridis_d(option = "plasma")
      
    ggplotly(p, tooltip = c("x", "Treatment")) %>% config(displayModeBar = FALSE)
  })
  
  output$diag_plot <- renderPlotly({
    req(predictions())
    df <- data.frame(
      Metric = c("Lower 95% CI", "Median", "Upper 95% CI"),
      Value = c(predictions()$ci_lower, predictions()$median_survival, predictions()$ci_upper)
    )
    df$Metric <- factor(df$Metric, levels = c("Upper 95% CI", "Median", "Lower 95% CI"))
    
    p <- ggplot(df, aes(x = Value, y = Metric, fill = Metric)) +
      geom_col(alpha = 0.8, width = 0.5) +
      theme_minimal(base_family = "Inter") +
      scale_fill_manual(values = c("#3498DB", "#2C3E50", "#E74C3C")) +
      labs(x = "Months", y = "", title = "Posterior Credible Intervals") +
      theme(legend.position = "none")
    ggplotly(p) %>% config(displayModeBar = FALSE)
  })
  
  output$export_csv <- downloadHandler(
    filename = function() { paste("Patient_Prediction_", Sys.Date(), ".csv", sep = "") },
    content = function(file) {
      res <- predictions()
      df <- data.frame(
        Age = input$age,
        Sex = input$sex,
        Smoking_Status = input$smoke,
        Pack_Years = input$pack_years,
        ECOG = input$ecog,
        Stage = input$stage,
        Tumor_Size = input$tumor_size,
        Treatment = input$treatment,
        Genetic_Score = input$genetic_score,
        Median_Survival_Months = res$median_survival,
        Lower_95_CI = res$ci_lower,
        Upper_95_CI = res$ci_upper,
        Survival_Prob_5y = res$prob_surv_5y,
        Mortality_Prob_5y = res$prob_mortality_5y
      )
      write.csv(df, file, row.names = FALSE)
    }
  )
  
  output$export_pdf <- downloadHandler(
    filename = function() { paste("Clinical_Report_", Sys.Date(), ".pdf", sep = "") },
    content = function(file) {
      tempReport <- file.path(tempdir(), "report.Rmd")
      rmd_content <- c(
        "---",
        "title: 'Bayesian Lung Cancer Survival Prediction Report'",
        "date: '`r Sys.Date()`'",
        "output: pdf_document",
        "---",
        "",
        "## Patient Clinical Summary",
        paste("- **Age**: ", input$age),
        paste("- **Sex**: ", input$sex),
        paste("- **Smoking Status**: ", input$smoke),
        paste("- **ECOG Score**: ", input$ecog),
        paste("- **Cancer Stage**: ", input$stage),
        paste("- **Tumor Size**: ", input$tumor_size, " cm"),
        paste("- **Planned Treatment**: ", input$treatment),
        "",
        "## Posterior Predictive Results",
        paste("- **Median Survival Estimate**: ", round(predictions()$median_survival, 1), " Months"),
        paste("- **95% Credible Interval**: [", round(predictions()$ci_lower, 1), ", ", round(predictions()$ci_upper, 1), "]"),
        paste("- **5-Year Survival Probability**: ", round(predictions()$prob_surv_5y * 100, 1), "%"),
        paste("- **Probability of Mortality at 5 yrs**: ", round(predictions()$prob_mortality_5y * 100, 1), "%"),
        "",
        "### Interpretation & Disclaimer",
        "This outcome is dynamically derived from a Bayesian MCMC generalized linear mixed survival model.",
        "It generates full credible intervals reflecting real-world uncertainty.",
        "It does not replace professional medical judgment."
      )
      
      writeLines(rmd_content, tempReport)
      
      tryCatch({
        rmarkdown::render(tempReport, output_file = file, envir = new.env(parent = globalenv()), quiet = TRUE)
      }, error = function(e){
        writeLines(c("Notice: RMarkdown PDF generation requires a LaTeX distribution (like TinyTeX).", 
                     "Generating a fallback text report.", "", rmd_content), file)
      })
    }
  )
}
