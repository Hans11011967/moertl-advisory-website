CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  rolle TEXT,
  quelle TEXT,
  anliegen TEXT NOT NULL,
  ip_country TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);
