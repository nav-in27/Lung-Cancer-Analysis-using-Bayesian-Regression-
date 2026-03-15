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

  # ---------------------------------------------------------------------------
  # FEATURE 1 — Patient Monitoring Timeline
  # ---------------------------------------------------------------------------
  observe({
    if (!is.null(followup_data)) {
      ids <- unique(followup_data$patient_id)
      updateSelectInput(session, "monitoring_patient_id",
                        choices  = as.character(ids),
                        selected = as.character(ids[1]))
    }
  })

  output$tumor_timeline_plot <- renderPlotly({
    req(input$monitoring_patient_id, !is.null(followup_data))
    df <- followup_data[followup_data$patient_id == input$monitoring_patient_id, ]
    validate(need(nrow(df) > 0, "No follow-up data for selected patient."))

    p <- ggplot(df, aes(x = visit_month, y = tumor_size_cm)) +
      geom_line(color = "#2C3E50", linewidth = 1.2) +
      geom_point(aes(text = paste0("Visit ", visit_number,
                                   "<br>Month: ", visit_month,
                                   "<br>Tumor: ", tumor_size_cm, " cm")),
                 color = "#E74C3C", size = 3.5) +
      theme_minimal(base_family = "Inter") +
      labs(x = "Visit Month", y = "Tumor Size (cm)",
           title = paste("Tumor Size Progression — Patient", input$monitoring_patient_id)) +
      scale_x_continuous(breaks = df$visit_month)

    ggplotly(p, tooltip = "text") %>% config(displayModeBar = FALSE)
  })

  output$ecog_timeline_plot <- renderPlotly({
    req(input$monitoring_patient_id, !is.null(followup_data))
    df <- followup_data[followup_data$patient_id == input$monitoring_patient_id, ]
    validate(need(nrow(df) > 0, "No follow-up data for selected patient."))

    ecog_labels <- c("0 – Fully active", "1 – Restricted", "2 – Ambulatory",
                     "3 – Limited self-care", "4 – Disabled")

    p <- ggplot(df, aes(x = visit_month, y = ecog_score)) +
      geom_step(color = "#18BC9C", linewidth = 1.2) +
      geom_point(aes(text = paste0("Visit ", visit_number,
                                   "<br>Month: ", visit_month,
                                   "<br>ECOG: ", ecog_score)),
                 color = "#2C3E50", size = 3.5) +
      scale_y_continuous(breaks = 0:4, limits = c(-0.5, 4.5),
                         labels = 0:4) +
      theme_minimal(base_family = "Inter") +
      labs(x = "Visit Month", y = "ECOG Score",
           title = "ECOG Performance Status Over Time")

    ggplotly(p, tooltip = "text") %>% config(displayModeBar = FALSE)
  })

  output$response_timeline_plot <- renderPlotly({
    req(input$monitoring_patient_id, !is.null(followup_data))
    df <- followup_data[followup_data$patient_id == input$monitoring_patient_id, ]
    validate(need(nrow(df) > 0, "No follow-up data for selected patient."))

    resp_colors <- c("Complete"    = "#28A745",
                     "Partial"     = "#17A2B8",
                     "Stable"      = "#FFC107",
                     "Progressive" = "#E74C3C")

    resp_order  <- c("Progressive", "Stable", "Partial", "Complete")
    df$resp_num <- match(df$treatment_response, resp_order)

    p <- ggplot(df, aes(x = visit_month, y = resp_num,
                        fill = treatment_response,
                        text = paste0("Visit ", visit_number,
                                      "<br>Month: ", visit_month,
                                      "<br>Response: ", treatment_response))) +
      geom_col(alpha = 0.80, width = 0.8) +
      scale_fill_manual(values = resp_colors, name = "Response") +
      scale_y_continuous(breaks = 1:4, labels = resp_order) +
      theme_minimal(base_family = "Inter") +
      labs(x = "Visit Month", y = "Treatment Response",
           title = "Treatment Response History") +
      theme(legend.position = "bottom")

    ggplotly(p, tooltip = "text") %>% config(displayModeBar = FALSE)
  })

  # ---------------------------------------------------------------------------
  # FEATURE 2 — Treatment Outcome Simulator
  # ---------------------------------------------------------------------------
  treatment_sim_data <- eventReactive(input$predict_btn, {
    trts <- c("Chemotherapy", "Radiation", "Surgery", "Immunotherapy")

    results <- lapply(trts, function(t) {
      res <- generate_prediction(
        age = input$age, sex = input$sex, smoke = input$smoke,
        pack_years = input$pack_years, ecog = input$ecog,
        stage = input$stage, tumor_size = input$tumor_size,
        treatment = t, genetic_score = input$genetic_score
      )
      data.frame(
        Treatment = t,
        Median    = res$median_survival,
        Lower     = res$ci_lower,
        Upper     = res$ci_upper,
        Prob5y    = res$prob_surv_5y * 100,
        stringsAsFactors = FALSE
      )
    })

    df       <- do.call(rbind, results)
    df$Rank  <- rank(-df$Median, ties.method = "min")
    df$Best  <- df$Median == max(df$Median)
    df
  }, ignoreNULL = FALSE)

  output$treatment_sim_plot <- renderPlotly({
    req(treatment_sim_data())
    df <- treatment_sim_data()
    df$Treatment <- factor(df$Treatment,
                           levels = df$Treatment[order(df$Median)])
    best_val <- max(df$Median)

    p <- ggplot(df, aes(x = Median, y = Treatment, color = Best,
                        text = paste0(Treatment,
                                      "<br>Median: ", round(Median, 1), " mo",
                                      "<br>95% CI: [", round(Lower, 1),
                                      ", ", round(Upper, 1), "]"))) +
      geom_point(size = 5) +
      geom_errorbarh(aes(xmin = Lower, xmax = Upper),
                     height = 0.25, linewidth = 1.2) +
      scale_color_manual(values = c("TRUE" = "#28A745", "FALSE" = "#2C3E50"),
                         guide = "none") +
      theme_minimal(base_family = "Inter") +
      labs(x = "Expected Median Survival (Months)", y = "",
           title = "Treatment Outcome Simulator — Posterior Predictions (95% Credible Intervals)",
           subtitle = "● Green = Best Treatment")  +
      theme(plot.subtitle = element_text(color = "#28A745", face = "bold"))

    ggplotly(p, tooltip = "text") %>% config(displayModeBar = FALSE)
  })

  output$treatment_prob_plot <- renderPlotly({
    req(treatment_sim_data())
    df <- treatment_sim_data()
    df$Treatment <- factor(df$Treatment,
                           levels = df$Treatment[order(df$Prob5y)])

    p <- ggplot(df, aes(x = Prob5y, y = Treatment, fill = Prob5y,
                        text = paste0(Treatment, ": ",
                                      round(Prob5y, 1), "%"))) +
      geom_col(alpha = 0.85) +
      geom_text(aes(label = paste0(round(Prob5y, 1), "%")),
                hjust = -0.1, size = 3.5, color = "#2C3E50") +
      scale_fill_gradient(low = "#E74C3C", high = "#28A745", guide = "none") +
      theme_minimal(base_family = "Inter") +
      labs(x = "5-Year Survival Probability (%)", y = "",
           title = "5-Year Survival by Treatment") +
      xlim(0, 108)

    ggplotly(p, tooltip = "text") %>% config(displayModeBar = FALSE)
  })

  output$treatment_rank_table <- DT::renderDataTable({
    req(treatment_sim_data())
    df <- treatment_sim_data()
    df <- df[order(df$Rank), ]

    display_df <- data.frame(
      Rank        = df$Rank,
      Treatment   = df$Treatment,
      `Median (mo)` = sprintf("%.1f", df$Median),
      `95% CI`    = sprintf("[%.1f, %.1f]", df$Lower, df$Upper),
      `5-Yr Prob` = sprintf("%.1f%%", df$Prob5y),
      check.names = FALSE,
      stringsAsFactors = FALSE
    )

    DT::datatable(
      display_df,
      options  = list(dom = "t", ordering = FALSE, pageLength = 10),
      rownames = FALSE
    ) %>%
      DT::formatStyle(
        "Rank",
        target          = "row",
        backgroundColor = DT::styleEqual(1, "#d4edda")
      )
  })

  # ---------------------------------------------------------------------------
  # FEATURE 3 — Survival Projection Graph  (Clinical Insights tab)
  # ---------------------------------------------------------------------------
  output$survival_projection_plot <- renderPlotly({
    req(predictions())
    time_pts     <- seq(0, 120, by = 0.5)
    lambda_med   <- log(2) / predictions()$median_survival
    # A wider CI means a larger upper-bound survival time, which implies a
    # *lower* hazard rate (lambda_lower), and vice versa for the lower bound.
    lambda_lower <- log(2) / predictions()$ci_upper   # ci_upper (longer survival) → lower hazard
    lambda_upper <- log(2) / predictions()$ci_lower   # ci_lower (shorter survival) → higher hazard

    df <- data.frame(
      Time   = time_pts,
      Median = exp(-lambda_med   * time_pts),
      Lower  = exp(-lambda_upper * time_pts),
      Upper  = pmin(exp(-lambda_lower * time_pts), 1)
    )

    plot_ly(df, x = ~Time) %>%
      add_ribbons(ymin = ~Lower, ymax = ~Upper,
                  fillcolor = "rgba(24,188,156,0.20)",
                  line      = list(color = "transparent"),
                  name      = "95% CI") %>%
      add_lines(y    = ~Median,
                line = list(color = "#18BC9C", width = 3),
                name = "Median Survival") %>%
      add_lines(y    = ~Lower,
                line = list(color = "#18BC9C", width = 1, dash = "dash"),
                name = "Lower 95% CI") %>%
      add_lines(y    = ~Upper,
                line = list(color = "#18BC9C", width = 1, dash = "dash"),
                name = "Upper 95% CI") %>%
      layout(
        title       = list(text = "Survival Probability Projection Over Time"),
        xaxis       = list(title = "Time (Months)", gridcolor = "#f0f0f0"),
        yaxis       = list(title = "Probability of Survival",
                           range = c(0, 1), gridcolor = "#f0f0f0"),
        legend      = list(x = 0.65, y = 0.95),
        paper_bgcolor = "white",
        plot_bgcolor  = "white",
        font        = list(family = "Inter")
      ) %>%
      config(displayModeBar = FALSE)
  })

  # ---------------------------------------------------------------------------
  # FEATURE 4 — AI Explanation Panel  (Clinical Insights tab)
  # ---------------------------------------------------------------------------
  output$ai_importance_plot <- renderPlotly({
    req(predictions())
    df <- get_variable_importance(
      age = input$age, sex = input$sex, smoke = input$smoke,
      pack_years = input$pack_years, ecog = input$ecog,
      stage = input$stage, tumor_size = input$tumor_size,
      treatment = input$treatment, genetic_score = input$genetic_score
    )
    df <- df[order(df$Importance), ]
    df$Factor <- factor(df$Factor, levels = df$Factor)

    p <- ggplot(df, aes(x = Importance, y = Factor, fill = Importance,
                        text = paste0(Factor, ": ", round(Importance, 1), "%"))) +
      geom_col(alpha = 0.85) +
      geom_text(aes(label = paste0(round(Importance, 1), "%")),
                hjust = -0.1, size = 3.5, color = "#2C3E50") +
      scale_fill_gradient(low = "#17A2B8", high = "#E74C3C", guide = "none") +
      theme_minimal(base_family = "Inter") +
      labs(x = "Relative Importance (%)", y = "",
           title = "Variable Importance for Prediction") +
      xlim(0, max(df$Importance) * 1.25)

    ggplotly(p, tooltip = "text") %>% config(displayModeBar = FALSE)
  })

  output$ai_explanation_text <- renderUI({
    req(predictions())
    df <- get_variable_importance(
      age = input$age, sex = input$sex, smoke = input$smoke,
      pack_years = input$pack_years, ecog = input$ecog,
      stage = input$stage, tumor_size = input$tumor_size,
      treatment = input$treatment, genetic_score = input$genetic_score
    )
    df      <- df[order(-df$Importance), ]
    top_fac <- head(df, 4)

    items <- lapply(seq_len(nrow(top_fac)), function(i) {
      tags$li(tags$strong(top_fac$Factor[i]),
              sprintf(" — %.1f%% influence", top_fac$Importance[i]))
    })

    tagList(
      tags$ul(items),
      br(),
      tags$p(
        sprintf(
          "Predicted median survival: %.1f months (95%% CI: %.1f–%.1f)",
          predictions()$median_survival,
          predictions()$ci_lower,
          predictions()$ci_upper
        ),
        style = "font-weight:600;color:#2C3E50;"
      )
    )
  })

  # ---------------------------------------------------------------------------
  # FEATURE 5 — Patient Risk Gauge  (Clinical Insights tab)
  # ---------------------------------------------------------------------------
  output$risk_gauge_plot <- renderPlotly({
    req(predictions())
    val <- predictions()$prob_surv_5y * 100

    gauge_color <- if (val >= 70) "#28A745" else if (val >= 40) "#FFC107" else "#E74C3C"

    plot_ly(
      domain = list(x = c(0, 1), y = c(0, 1)),
      value  = val,
      title  = list(text = "5-Year Survival Probability (%)",
                    font = list(size = 15)),
      type   = "indicator",
      mode   = "gauge+number+delta",
      delta  = list(
        reference  = 50,
        increasing = list(color = "#28A745"),
        decreasing = list(color = "#E74C3C")
      ),
      number = list(suffix = "%", font = list(size = 42, color = gauge_color)),
      gauge  = list(
        axis       = list(range = list(NULL, 100),
                          tickwidth = 1, tickcolor = "#2C3E50"),
        bar        = list(color = gauge_color),
        bgcolor    = "white",
        borderwidth = 2,
        bordercolor = "#e9ecef",
        steps = list(
          list(range = c(0,  40), color = "#FFECEC"),
          list(range = c(40, 70), color = "#FFF9EC"),
          list(range = c(70, 100), color = "#ECFFF4")
        ),
        threshold = list(
          line      = list(color = "#2C3E50", width = 4),
          thickness = 0.75,
          value     = val
        )
      )
    ) %>%
      layout(
        margin        = list(l = 20, r = 20, t = 80, b = 20),
        paper_bgcolor = "white",
        font          = list(family = "Inter")
      )
  })
}
