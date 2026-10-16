# Automation AI Chatbot

An educational AI chatbot specialized in teaching **Automation** to beginners.

The project was built using **FastAPI**, **JavaScript**, and the **Google Gemini API**, with support for persistent conversation history, multiple chats, context-aware responses, and a specialized system prompt.

---

## Features

- AI-powered chatbot using Google Gemini.
- Specialized in Automation learning.
- Multi-chat conversation system.
- Persistent conversation history using Local Storage.
- Context-aware follow-up questions.
- Previous conversation history is sent with every new message.
- Dark and Light themes.
- Automatic chat titles based on the first question.
- Clickable links in AI responses.
- Loading state while waiting for Gemini.
- Error handling for server and connection problems.
- Secure API key using environment variables.
- Protection against requests outside the chatbot's specialization.

---

## Technologies

### Backend
- Python
- FastAPI
- Pydantic
- Uvicorn
- Google Gemini API
- python-dotenv

### Frontend
- HTML
- CSS
- JavaScript
- Local Storage

---

## Project Architecture

```text
User
  ↓
HTML / CSS / JavaScript
  ↓
POST /chat
  ↓
FastAPI
  ↓
ask_chat()
  ↓
Google Gemini API
  ↓
FastAPI Response
  ↓
JavaScript
  ↓
Chat Interface
```

---

## Conversation History

Each chat has its own conversation history.

```text
Chat
├── id
├── title
└── history
    ├── user message
    ├── model response
    ├── user message
    └── model response
```

Before sending a new message, JavaScript copies the previous conversation history:

```javascript
let oldHistory = [...chat.history];
```

The current question and previous history are then sent to FastAPI:

```javascript
body: JSON.stringify({
    message: question,
    history: oldHistory
})
```

FastAPI receives them:

```python
from pydantic import BaseModel

class Question(BaseModel):
    message: str
    history: list
```

Then the history is converted to Gemini's conversation format and sent with the current message.

After receiving the response, both the user's message and Gemini's response are added to the chat history.

```javascript
chat.history.push({
    role: "user",
    text: question
});

chat.history.push({
    role: "model",
    text: data.answer
});
```

The chats are stored in the browser using:

```javascript
localStorage
```

This allows conversations to remain available even after closing and reopening the application.

---

## Project Structure

```text
PythonProject3/
│
├── main.py
├── project_last.py
│
├── index.html
├── style.css
├── script.js
│
├── requirements.txt
├── .gitignore
├── .env
└── README.md
```

### `main.py`

Responsible for:

- Running the FastAPI server.
- Serving frontend files.
- Receiving chat requests.
- Sending messages to the AI logic.
- Returning Gemini responses to the frontend.

### `project_last.py`

Responsible for:

- Loading the Gemini API key.
- Creating the Gemini client.
- Defining the chatbot system instructions.
- Converting conversation history to Gemini format.
- Sending messages to Gemini.
- Returning the generated response.

### `script.js`

Responsible for:

- Sending messages to FastAPI.
- Managing multiple conversations.
- Managing conversation history.
- Saving chats in Local Storage.
- Switching between chats.
- Rendering messages.
- Managing Dark/Light themes.

---

## Installation

### 1. Clone the repository

```bash
git clone YOUR_REPOSITORY_URL
```

### 2. Open the project

```bash
cd PythonProject3
```

### 3. Create a virtual environment

```bash
python -m venv .venv
```

### 4. Activate the virtual environment

Windows:

```bash
.venv\Scripts\activate
```

### 5. Install dependencies

```bash
pip install -r requirements.txt
```

---

## Environment Variables

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key
```

The API key is loaded securely in Python:

```python
load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
```

The `.env` file is excluded from Git using `.gitignore`.

---

## Run the Project

Run:

```bash
python main.py
```

Then open:

```text
http://127.0.0.1:8002
```

---

## Chat Flow

```text
User writes a question
        ↓
JavaScript reads the active chat
        ↓
Previous history is copied
        ↓
Question + History are sent to FastAPI
        ↓
FastAPI sends them to Gemini
        ↓
Gemini generates a response
        ↓
FastAPI returns the response
        ↓
JavaScript displays it
        ↓
Question + Response are saved in History
        ↓
History is saved in Local Storage
```

---

## AI Specialization

The chatbot uses a dedicated system instruction that limits it to the field of **Automation**.

It can help beginners learn topics such as:

- Python Automation
- File Automation
- Web Automation
- API Automation
- RPA
- Workflow Automation
- No-Code Automation
- Low-Code Automation
- Nodes
- Triggers
- Actions
- Conditions

The chatbot also uses previous conversation context to understand follow-up questions such as:

- "Explain more"
- "I didn't understand"
- "How?"
- "Give me an example"

---

## Security

The Gemini API key is not stored directly inside the source code.

Sensitive values are stored inside:

```text
.env
```

and `.env` is excluded from GitHub using:

```text
.gitignore
```

---

## Future Improvements

- Delete individual conversations.
- Rename conversations.
- Clear all conversations.
- Export conversations.
- User authentication.
- Database-based conversation storage.
- Streaming AI responses.
- Markdown formatting for AI responses.

---

## Author

Developed as an educational AI chatbot project focused on building practical experience in:

- AI chatbot development
- API integration
- Conversation history
- Prompt engineering
- FastAPI
- Frontend and backend integration