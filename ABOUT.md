# Jobright AI - Clone

**Name:** Job Application Filler

- All career webpage detectable
- Get data of all webpage.

Type: A single webpage (Controller) and an extension connected to controller to fecth all the info


Note: The most Expensive model will only draft the rule like (Opus) and code will be written by lower model (sonnet).
---

## 📋 Centralized Information (YAML Format)

```yaml
applicant_profile:
  # 1. Personal Information
  personal_information:
    first_name: ""
    last_name: ""
    email: ""
    phone_number: ""
    address:
      street: ""
      city: ""
      state: ""
      postal_code: ""
      country: ""
    linkedin_url: ""
    portfolio_url: ""

  # 2. Work Experience
  work_experience:
    - job_title: ""
      company_name: ""
      location: ""
      start_date: "" # YYYY-MM
      end_date: ""   # YYYY-MM or "Present"
      is_current_role: false
      description: ""

  # 3. Work Authorization & Sponsorship
  work_authorization:
    authorized_to_work_in_country: true
    requires_sponsorship_now_or_future: false
    visa_status: "" # e.g., F-1 OPT, H-1B, Green Card, Citizen

  # 4. Government & Compliance Details
  government_compliance:
    is_former_government_employee: false
    clearance_level: "" # e.g., None, Secret, Top Secret
    export_control_status: "" # ITAR/EAR restriction checks

  # 5. E-Signature & Attestation
  e_signature:
    full_name: ""
    date: "" # YYYY-MM-DD
    attestation_agreed: true

  # 6. Terms & Consents (Opt-outs included)
  consents:
    agree_to_privacy_policy: true
    agree_to_terms_and_conditions: true
    opt_in_talent_community: false # Skip marketing/future outreach if desired
    opt_in_sms_notifications: false

  # 7. Source Tracking
  source_attribution:
    how_did_you_hear_about_us: "" # e.g., LinkedIn, Referral, Company Website

  # 8. Voluntary Equal Employment Opportunity (EEO) & Demographics
  voluntary_demographics:
    gender_identity: "" # Male, Female, Non-binary, Prefer not to say
    transgender_status: "" # Yes, No, Prefer not to say
    race_ethnicity: "" # White, Asian, Black/African American, Hispanic/Latino, etc.
    sexual_orientation: "" # Heterosexual, Gay/Lesbian, Bisexual, etc.
    veteran_status: "" # Protected Veteran, Non-Veteran, Prefer not to say
    disability_status: "" # Yes, No, Prefer not to say (frequently missed on EEO forms)

```
---

## ⚙️ Requirements & Features

* **AI & API:**  
  * For AI, no API costing needed.
  * Integrate with the local Claude code & Codex available.

* **Layout & UI Structure:**  
  * One web page (Handling the storage of resume, all the information like YAML) and second the Auto filler bar.
  * **UI Sketch:**

* **Sticky Feature:**  
  * Should have a sticky feature button so that user can open the window.

* **Auto Detection:**  
  * Auto detecting the career page and widget should be visible.



Things to do before staring coding.
1) Find everyhting about the Email ATS application:  Greenhouse, Lever, Ashby, Gem, Workday,iCIMS, SmartRecruiters, Oracle Taleo / Fusion Cloud Recruiting.
2) Create a PLAN.md make sure everything is well structured.
3) Dont create a complex architecture. Keep it basic, modular and efficient.
4) Use React/Typescript, gluestack, tailwind.
5) Working model should be ready quickly but one thing must be ensured is that no compramise in features.
6) UI Sketch will be given later.


We also want to ensur ethat this application which will be running locally, it should have a way to connect to a claude code/codex. No API cost needed. Wherever the AI stuff is needed it should be communicated with these technologies.

We will be using the node.js and claude cli for this getting the AI help. 

AI Integration:

### Local Claude CLI Integration

This app delegates AI reasoning and text generation to the user's local Claude Pro entitlement via the official Anthropic CLI. This design avoids external API key dependencies and handles inference costs through active local subscriptions.

* **Architecture:** Node.js Backend ──(Subprocess execution)──> `claude -p` CLI ──> Web App UI / DOM Injection
* **Execution Mode:** Uses non-interactive headless mode (`claude -p "<prompt>" --bare`) to stream direct text responses to `stdout`.
* **Prompt Isolation:** System instructions strictly require raw string output with zero conversational wrappers or JSON overhead, making responses directly copy-paste or auto-fill ready.
* **Prerequisites:** Requires Node.js runtime and an authenticated local CLI (`claude login` completed in terminal).