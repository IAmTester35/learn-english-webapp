# Exam Authoring Guide: Creating Tests for L TestLab

This guide is designed for **exam creators, teachers, and test authors**. It explains how to structure and author comprehensive standardized English examinations focusing on objective **Reading and Listening** comprehension in standardized JSON format.

> [!NOTE]
> **Scope of Assessment:**
> In accordance with standardized test automation, examinations focus strictly on **Reading and Listening comprehension**.

---

## 1. Test Overview & Metadata

Each examination is authored as a single JSON file. The test file contains general information about the exam and structures content into core skill sections:

```json
{
  "schemaVersion": "1.0",
  "id": "b1-intermediate-english-test-01",
  "title": "B1 Intermediate English Examination (CEFR / PET Standard)",
  "description": "Comprehensive CEFR B1 assessment evaluating Reading and Listening comprehension.",
  "sections": {
    "reading": { ... },
    "listening": { ... }
  }
}
```

### Overview Fields

| Field           | Type     | Required | Purpose for Authors                                                                                                                           |
| :-------------- | :------- | :------- | :-------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion` | `string` | Yes      | Always set to `"1.0"`.                                                                                                                        |
| `id`            | `string` | Yes      | A unique identifier in lowercase kebab-case (e.g., `b1-test-01`, `ielts-academic-02`). Name your file using this same ID (`b1-test-01.json`). |
| `title`         | `string` | Yes      | The official exam title displayed to students (e.g., `"A2 Key English Comprehensive Test"`).                                                  |
| `description`   | `string` | Yes      | A brief summary of the exam's level, skills covered, and target audience.                                                                     |
| `sections`      | `object` | Yes      | Contains the core assessed skill modules: `reading` and `listening` (Speaking and Writing are disabled and omitted).                          |

---

## 2. Exam Structure & CEFR Alignment Blueprint

To maintain international validity and prevent cognitive fatigue, align your examination's volume, passage lengths, and audio durations with the target Common European Framework of Reference (CEFR) level:

| CEFR Level | Benchmark Equivalent        | Reading Section                                                               | Listening Section                                                            | Target Total Questions | Estimated Total Time |
| :--------- | :-------------------------- | :---------------------------------------------------------------------------- | :--------------------------------------------------------------------------- | :--------------------- | :------------------- |
| **A2**     | Cambridge Key (KET)         | **4–5 passages**<br>• 120–200 words per text<br>• 20–25 total questions       | **4–5 short audio parts**<br>• 45–90 seconds each<br>• 20–25 total questions | **40–50 questions**    | ~45 mins             |
| **B1**     | Cambridge Preliminary (PET) | **3–4 passages**<br>• 300–450 words per text<br>• 15–20 total questions       | **3–4 audio parts**<br>• 1.5–2.5 minutes each<br>• 15–20 total questions     | **30–40 questions**    | ~60 mins             |
| **B2**     | Cambridge First (FCE)       | **3–4 passages**<br>• 500–650 words per text<br>• 18–24 total questions       | **3–4 audio parts**<br>• 2.5–3.5 minutes each<br>• 15–20 total questions     | **35–45 questions**    | ~75 mins             |
| **C1**     | Cambridge Advanced (CAE)    | **3–4 academic texts**<br>• 700–900 words per text<br>• 18–24 total questions | **3–4 audio parts**<br>• 3–4.5 minutes each<br>• 16–20 total questions       | **35–45 questions**    | ~85 mins             |

### Structural Rules for Test Designers

1. **Question Density:** Target **4 to 6 questions per passage or audio part** (or up to 8 questions for longer advanced texts). This ensures thorough testing without overloading candidates on a single topic, while keeping total question counts balanced with the CEFR blueprint.
2. **Audio Word Counts & Pacing:** For realistic pacing, script lengths and expected audio durations should correspond to:
   - A2: 80–130 words per part (slow pacing ~90–100 wpm, ~45–90s).
   - B1: 180–280 words per part (moderate pacing ~120–130 wpm, ~1.5–2.5 mins).
   - B2: 300–450 words per part (moderate-to-fast pacing ~130–145 wpm, ~2.5–3.5 mins).
   - C1: 500–700 words per part (fast native lecture/broadcast ~150–165 wpm, ~3–4.5 mins).
3. **Format Diversity:** Combine factual multiple-choice, fill-in-the-blank, and True/False/Not Given questions across parts rather than using a single question type exclusively.

---

## 3. Standard Question Types (Reading & Listening)

Reading and Listening sections use four standard question formats.

### Core Rules for Authors

- **Unique Question IDs:** Every question must have an ID that is unique throughout the entire test (e.g., `r-q1`, `r-q2` for Reading; `l-q1`, `l-q2` for Listening). Never reuse an ID.
- **Clear Explanations (`explanation`):** Provide a brief rationale referencing the passage or script. This is shown to students on their results page to support learning.

---

### 3.1. Single-Choice Question (`multiple_choice`)

Standard multiple-choice with one correct answer.

```json
{
  "id": "r-q1",
  "type": "multiple_choice",
  "prompt": "What is the primary objective of the marine research project?",
  "options": [
    { "id": "A", "text": "To monitor sea turtle nesting grounds" },
    { "id": "B", "text": "To clean hotel beachfronts" },
    { "id": "C", "text": "To capture invasive fish species" },
    { "id": "D", "text": "To conduct commercial tours" }
  ],
  "correctAnswer": "A",
  "explanation": "Paragraph 1 states: 'The project focuses on monitoring and protecting nesting sea turtles.'"
}
```

- `options`: Provide at least 2 plausible options (typically 3 or 4). Each option has an `id` (e.g., `"A"`, `"B"`, `"C"`, `"D"`) and display `text`.
- `correctAnswer`: Must strictly match the `id` of the correct option.

---

### 3.2. Multiple-Select Question (`multiple_select`)

Used when students must pick two or more correct answers from a list.

```json
{
  "id": "r-q2",
  "type": "multiple_select",
  "prompt": "Which TWO daily responsibilities of the volunteers are stated in paragraph 2?",
  "options": [
    { "id": "A", "text": "Sanitizing the egg hatcheries" },
    { "id": "B", "text": "Preparing meals for hotel visitors" },
    { "id": "C", "text": "Gathering washed-up plastic refuse" },
    { "id": "D", "text": "Driving tourists to city attractions" }
  ],
  "correctAnswers": ["A", "C"],
  "explanation": "Paragraph 2 explicitly lists sanitizing hatcheries (A) and gathering plastic waste (C)."
}
```

- `correctAnswers`: List of all correct option IDs (e.g., `["A", "C"]`).
- **Scoring Note:** This question type uses **all-or-nothing** scoring (no partial credit). To avoid ambiguity, always state the exact number of answers required in the prompt (e.g., _"Which TWO reasons..."_ or _"Select THREE items..."_).

---

### 3.3. Fill-in-the-Blank (`fill_blank`)

Used for short answer or gap-fill tasks.

```json
{
  "id": "l-q2",
  "type": "fill_blank",
  "prompt": "The guest house recommended by Chloe's cousin is named ________.",
  "acceptedAnswers": [
    "Green Gardens",
    "Green Gardens Guest House",
    "the Green Gardens"
  ],
  "caseSensitive": false,
  "explanation": "Chloe mentions: 'My cousin recommended a small guest house called Green Gardens.'"
}
```

- `acceptedAnswers`: List **all acceptable variations** that should receive full credit.
- `caseSensitive` (`boolean`, optional, default: `false`): Leave as `false` unless capitalization is specifically being assessed.
- **Authoring Advice:** The scoring engine removes extra spaces between words, but keeps punctuation and articles. Ensure you list realistic variations, such as:
  - Numbers as words vs. digits: `["two", "2"]`
  - With or without common articles: `["train station", "the train station"]`
  - UK vs. US spelling: `["centre", "center"]`, `["colour", "color"]`

---

### 3.4. True / False / Not Given (`true_false_ng`)

Used to test factual verification against a text or recording.

```json
{
  "id": "r-q8",
  "type": "true_false_ng",
  "prompt": "Maria's home workstation is located in a dedicated private study room.",
  "correctAnswer": "FALSE",
  "explanation": "Paragraph 2 states she set up her desk in a bedroom corner, not a dedicated study."
}
```

- `correctAnswer`: Must be one of three exact values: `"TRUE"`, `"FALSE"`, or `"NOT_GIVEN"`.
- **Do not write an `options` list:** The exam interface automatically displays standard buttons for `TRUE`, `FALSE`, and `NOT_GIVEN`.

---

## 4. Reading Section (`reading`)

The Reading section consists of student instructions and one or more reading passages.

```json
"reading": {
  "instructions": "Read the passages carefully and answer all questions from r-q1 to r-q8.",
  "passages": [
    {
      "id": "r-p1",
      "title": "A Volunteer Vacation in Costa Rica",
      "content": "Last summer, twenty-year-old student Daniel decided to spend three weeks volunteering...\n\nDuring the day, volunteers carried out different tasks around the camp...",
      "questions": [
        /* Questions for this passage */
      ]
    }
  ]
}
```

### Passage Guidelines

- `id`: Use clear sequential identifiers (e.g., `r-p1`, `r-p2`).
- `title`: Give the passage a descriptive topic title (e.g., `"Working from Home: The New Normal"`). The exam platform automatically adds `"Passage 1:"` during the test.
- `content`: Paste the reading text here. Separate paragraphs with double line breaks (`\n\n`) to preserve readable paragraph spacing.
- `questions`: Group all questions relevant to this specific passage directly inside its `questions` array.

---

## 5. Listening Section (`listening`) & Audio Design

The Listening section allows authors to create realistic audio tests. You only need to write the script, specify character roles, and choose desired accents and pacing. **You do not need to record audio or manage audio files.**

```json
"listening": {
  "instructions": "Listen to the recordings carefully, then answer questions l-q1 to l-q6.",
  "parts": [
    {
      "id": "l-p1",
      "title": "Planning a Weekend Trip to York",
      "audioConfig": {
        "scenario": "everyday_dialogue",
        "accent": "british",
        "pacing": "moderate",
        "overallStyle": "casual friendly exchange, clear enunciation for B1 exam"
      },
      "speakers": [
        {
          "name": "Sam",
          "gender": "male",
          "voiceName": "Puck",
          "style": "inquiring, calm"
        },
        {
          "name": "Chloe",
          "gender": "female",
          "voiceName": "Aoede",
          "style": "upbeat, helpful, informative"
        }
      ],
      "transcript": "Sam: Hi, Chloe! Did you get a chance to look at train tickets for York?\nChloe: Yes! If we catch the train at seven in the morning, a return ticket is only twenty-five pounds each. But if we take the train at nine, the price doubles to fifty pounds!\nSam: That's a huge difference... I don't mind waking up early if it saves us twenty-five pounds.",
      "questions": [
        /* Questions for this audio part */
      ]
    }
  ]
}
```

> [!NOTE]
> **Candidate Privacy:** Transcripts are used exclusively by the testing engine to generate exam audio. They are **never shown to students during the test**, ensuring candidates are evaluated solely on their listening comprehension.

---

### 5.1. How Audio Works for Exam Authors

1. **Write the Transcript:** Create natural dialogue or monologue reflecting real-world communication.
2. **Set the Atmosphere (`audioConfig`):** Define the scenario (e.g., airport announcement, casual conversation), accent, and speed appropriate for your target CEFR level.
3. **Leave Audio Management to the System:** You do not need to provide or link audio files (`audioUrl`). The system automatically converts your transcript into high-fidelity exam audio.

---

### 5.2. Writing Natural Listening Scripts

#### Multi-Speaker Dialogues

- Format conversations with `CharacterName: Spoken text`.
  ```text
  Sam: Did you check the hotel prices?
  Chloe: Yes, they have two double rooms available.
  ```
- **Two-Speaker API Rule:** For each audio part, structure conversations between **two primary interacting characters**. If a third auxiliary character speaks (e.g., a waiter with one line), the engine will map them to the closest voice persona, but sticking to two distinct characters ensures maximum vocal clarity and acoustic realism.
- Keep character names simple and consistent so the system can match voices reliably.

#### Monologues & Announcements (Single Speaker)

- For announcements, news bulletins, or academic lectures:
  - You can write the text directly without prefixes, or use standard labels like `Announcer: ...` or `Lecturer: ...`.
  ```text
  Announcer: May I have your attention, please. The 10:15 service to Manchester Piccadilly will depart from Platform 3.
  ```

#### Pacing, Hesitations, and Pauses

- Write natural English dialogue tailored to your students' proficiency level.
- **Use standard punctuation to control rhythm:**
  - Ellipses (`...`) and em-dashes (`—`) create natural pauses and hesitations.
  - Commas and periods control phrase cadence.
  - Question marks and exclamation points guide inflection and energy.
  - **Avoid artificial fragmented periods:** Avoid breaking sentences with frequent periods (e.g., _"We. Must. Go."_), as this causes the acoustic synthesizer to produce choppy, unnatural micro-breaks.

#### Conversational Backchanneling (`|...|`)

```text
Sam: We arrived at the station around dawn, |right| and the ticket office was already packed.
Chloe: I warned you about the morning rush! |I know| But did you get the tickets?
Sam: Yes, thankfully! |phew| The clerk found two remaining seats in coach B.
```

Common natural backchannels: `|mhm|`, `|yeah|`, `|right|`, `|I see|`, `|really?|`, `|sure|`, `|phew|`, `|exactly|`.

#### Exact Pronunciation with IPA (`/.../`)

For proper nouns, regional dialects, or exam-specific proper names that standard text-to-speech might mispronounce (e.g., Celtic place names, historical figures, or British place names with irregular spelling), enclose the **International Phonetic Alphabet (IPA)** transcription within forward slashes (`/.../`):

```text
Lecturer: Today we will explore the architectural history of Edinburgh /ˌedɪnbərə/ and its historic castle.
Guide: Take the train toward Leicester /ˈlɛstər/, not toward Worcester /ˈwʊstər/.
```

#### Expressive Non-Speech Vocal Tags (Gemini TTS Vocal Events)

The underlying audio engine (Google Gemini TTS) natively supports **inline vocal tags** enclosed in angle brackets (`<...>`). You can embed these directly into spoken lines to produce authentic human vocalizations, emotional nuances, and realistic conversational texture:

| Category                  | Supported Tags                                                            | Description & Exam Use Case                                                                 |
| :------------------------ | :------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------ |
| **Laughter & Amusement**  | `<laugh>`, `<chuckle>`, `<giggle>`, `<snicker>`, `<cackle>`               | Natural chuckling or laughing during friendly, casual dialogues (e.g., PET/FCE Part 1 & 2). |
| **Breathing & Relief**    | `<breath>`, `<heavy breath>`, `<sigh>`, `<gasp>`, `<pant>`, `<exhales>`   | Expresses relief, exhaustion, surprise, or realistic conversational intake of air.          |
| **Human Vocal Reactions** | `<cough>`, `<throat-clearing>`, `<yawn>`, `<sob>`, `<groan>`, `<whisper>` | Adds character realism for interviews, lectures, or emotional narratives.                   |
| **Controlled Pauses**     | `<short pause>`, `<long pause>`                                           | Inserts precise timing pauses between statements beyond normal punctuation cadence.         |

- **Natural Interjections:** Spoken exclamations such as _"Argh!"_, _"Ugh"_, _"Hmm"_, _"Pfft"_, or _"Wow"_ should simply be written as words with expressive punctuation:
  ```text
  Sam: Argh! I forgot my library card again. <sigh>
  ```
- **Example Dialogue with Backchanneling & Vocal Tags:**
  ```text
  Sam: Did you actually manage to book the morning train tickets?
  Chloe: Yes! <chuckle> It was stressful, |oh really?| but we saved twenty-five pounds each.
  Sam: That's incredible... <sigh> What a relief. <short pause> Now we just need to pack.
  ```

#### Spoken Tags vs. Ambient Sound Effects

- **Angle Brackets `<tag>` (Vocal Events):** Performed directly by the speaker's voice (e.g., `<chuckle>`, `<sigh>`). Embed these inline within dialogue lines. Always use English keywords for tags.
- **Square Brackets `[Effect]` or `(Context)` (Stage Directions):** Setting notes or non-vocal ambient sound effects (e.g., `[Train whistle]` or `[Bell chimes]`). Write these **on their own separate line**; the audio generator automatically detects and excludes them so only spoken speech is heard.

---

### 5.3. Audio Atmosphere & Pacing (`audioConfig`)

Use these settings to match the scenario and target difficulty of your exam:

| Setting        | Options               | Best Used For                                                                 |
| :------------- | :-------------------- | :---------------------------------------------------------------------------- |
| `scenario`     | `everyday_dialogue`   | Everyday conversations, shopping, travel, asking directions (Part 1, Part 2). |
|                | `public_announcement` | Public notices at train stations, airports, museums, or schools.              |
|                | `interview`           | Job interviews, radio shows, or magazine podcasts.                            |
|                | `academic_lecture`    | University lectures, science presentations (IELTS/TOEFL style).               |
|                | `group_discussion`    | Multiple students or colleagues discussing a project.                         |
|                | `news_broadcast`      | Formal news reporting, financial bulletins, weather forecasts.                |
| `accent`       | `british`             | Received Pronunciation (Cambridge Key/PET/FCE/CAE & IELTS standard).          |
|                | `american`            | General American (standard American English).                                 |
|                | `australian`          | Australian English.                                                           |
|                | `canadian`            | Canadian English.                                                             |
|                | `standard`            | Neutral, international English.                                               |
| `pacing`       | `slow`                | Deliberate, clear pauses between sentences (CEFR A1–A2 elementary).           |
|                | `moderate`            | Natural conversational speed (CEFR B1 intermediate).                          |
|                | `fast`                | Natural native speaking speed (CEFR C1–C2 advanced).                          |
|                | `exam_standard`       | Balanced testing pace with distinct articulation and pauses.                  |
| `overallStyle` | _free text_           | Descriptive director notes and acoustic environment directives.               |

> [!TIP]
> **Acoustic Environment Staging in `overallStyle`:**
> You can include physical acoustic descriptions in `overallStyle` to simulate authentic real-world exam test situations:
>
> - **Public Transit / Station Announcement:** `"PA loudspeaker announcement, vast transit terminal reverberation, authoritative projection"`
> - **Radio / Podcast Interview:** `"soundproof broadcast studio, close-mic vocal warmth, dry acoustics, intimate clarity"`
> - **Academic Lecture:** `"large university lecture theatre, subtle natural hall echo, formal educational projection"`
> - **Casual Indoor Conversation:** `"quiet room acoustic, conversational proximity, natural speech dynamics"`

---

### 5.4. Character Casting & Voice Personas

You have two options for assigning voices:

#### Option A: Automatic Casting (Recommended)

Simply give your characters names (e.g., `Daniel`, `Chloe`, `Professor Adams`). The system will automatically select distinct, natural male and female voices suited to the dialogue.

#### Option B: Manual Casting

If you want to tailor specific vocal personalities, you can choose from the following voice personas:

- **Female Personas (12 Voices):**
  - `Kore`: Clear, formal, articulate (ideal for narrators and public announcements).
  - `Aoede`: Natural, youthful, conversational (ideal for students and friendly exchanges).
  - `Autonoe`: Warm, expressive.
  - `Leda`: Polite, elegant.
  - `Callirrhoe`: Bright, cheerful.
  - `Despina`: Gentle, approachable.
  - `Erinome`, `Laomedeia`, `Sadaltager`, `Sulafat`, `Pulcherrima`, `Vindemiatrix`.

- **Male Personas (18 Voices):**
  - `Puck`: Energetic, friendly, youthful (ideal for students and peers).
  - `Charon`: Deep, authoritative, measured (ideal for professors, lecturers, news anchors).
  - `Zephyr`: Warm, calm, reassuring.
  - `Orus`: Confident, professional.
  - `Achird`: Serious, formal.
  - `Fenrir`: Dynamic, expressive.
  - `Algieba`, `Umbriel`, `Schedar`, `Sadachbia`, `Enceladus`, `Algenib`, `Achernar`, `Gacrux`, `Zubenelgenubi`, `Iapetus`, `Rasalgethi`, `Alnilam`.

---

## 6. Exam Author Quality Checklist

Before submitting a new examination, review this pedagogical and quality checklist:

1. [ ] **CEFR Level Appropriateness:** Reading texts, vocabulary difficulty, and audio speed accurately reflect the target proficiency level (e.g., A2, B1, C1) as specified in the blueprint in Section 2.
2. [ ] **Question Density:** Each passage or audio part targets 4 to 6 questions (up to 8 for longer texts), aligning with the total question blueprint.
3. [ ] **Unique Question IDs:** Every question has a distinct ID (`r-q1`, `r-q2`, `l-q1`, etc.) with no duplicates across skills.
4. [ ] **Answer Key Verification:**
   - Single-choice and multiple-select answer keys strictly match available option IDs (`A`, `B`, `C`, etc.).
   - Multiple-select prompts explicitly specify the number of answers to choose (e.g., _"Choose TWO..."_).
   - True/False/Not Given questions use exact values: `TRUE`, `FALSE`, or `NOT_GIVEN`.
   - Fill-in-the-blank questions include all common spelling, numerical, and article variants in `acceptedAnswers`.
5. [ ] **Natural Dialogue Flow:** Listening transcripts sound authentic, utilizing natural punctuation (`...`, `—`) or supported inline vocal tags (`<chuckle>`, `<sigh>`, `<short pause>`) appropriately without overloading.
