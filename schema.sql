CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(255)  NOT NULL,
  email          VARCHAR(255)  UNIQUE,
  phone          VARCHAR(30)   UNIQUE,
  school         VARCHAR(255)  NOT NULL,
  role           VARCHAR(50)   NOT NULL CHECK (role IN ('student', 'course_rep', 'lecturer')),
  ref_id         VARCHAR(20)   UNIQUE NOT NULL,
  referred_by    VARCHAR(20)   REFERENCES users (ref_id) ON DELETE SET NULL,
  referral_count INTEGER       DEFAULT 0,
  created_at     TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_ref_id      ON users (ref_id);
CREATE INDEX IF NOT EXISTS idx_users_email        ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_phone        ON users (phone);
CREATE INDEX IF NOT EXISTS idx_users_referred_by  ON users (referred_by);

CREATE TABLE IF NOT EXISTS admins (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255)        NOT NULL,
  created_at    TIMESTAMPTZ         DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS surveys (
  id                   SERIAL PRIMARY KEY,
  title                VARCHAR(255) NOT NULL,
  description          TEXT,
  slug                 VARCHAR(100) UNIQUE NOT NULL,
  welcome_title        VARCHAR(255),
  welcome_description  TEXT,
  welcome_button_text  VARCHAR(100) DEFAULT 'Start',
  published            BOOLEAN DEFAULT false,
  preview_token        VARCHAR(64) NOT NULL,
  audience             VARCHAR(20) DEFAULT 'all' CHECK (audience IN ('all', 'student', 'lecturer', 'course_rep')),
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS survey_questions (
  id          SERIAL PRIMARY KEY,
  survey_id   INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  type        VARCHAR(30) NOT NULL CHECK (type IN (
    'short_text','long_text','multiple_choice','checkboxes',
    'yes_no','scale','email','phone','number'
  )),
  title       VARCHAR(500) NOT NULL,
  description TEXT,
  required    BOOLEAN DEFAULT true,
  options     JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ambassadors (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  email      VARCHAR(255),
  phone      VARCHAR(30),
  school     VARCHAR(255),
  ref_id     VARCHAR(20) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ambassadors_ref_id ON ambassadors (ref_id);

CREATE TABLE IF NOT EXISTS survey_responses (
  id                 SERIAL PRIMARY KEY,
  survey_id          INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  ref_id             VARCHAR(20) REFERENCES users(ref_id) ON DELETE SET NULL,
  ambassador_ref_id  VARCHAR(20) REFERENCES ambassadors(ref_id) ON DELETE SET NULL,
  answers            JSONB NOT NULL,
  submitted_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_surveys_slug          ON surveys (slug);
CREATE INDEX IF NOT EXISTS idx_survey_questions_sid  ON survey_questions (survey_id, position);
CREATE INDEX IF NOT EXISTS idx_survey_responses_sid  ON survey_responses (survey_id);

-- ── Migration (run against existing DBs) ──────────────────────────────────────
-- ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30) UNIQUE;
-- CREATE INDEX IF NOT EXISTS idx_users_phone ON users (phone);
-- ALTER TABLE surveys ADD COLUMN IF NOT EXISTS audience VARCHAR(20) DEFAULT 'all' CHECK (audience IN ('all', 'student', 'lecturer', 'course_rep'));
-- CREATE TABLE IF NOT EXISTS ambassadors (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(255), phone VARCHAR(30), school VARCHAR(255), ref_id VARCHAR(20) UNIQUE NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());
-- CREATE INDEX IF NOT EXISTS idx_ambassadors_ref_id ON ambassadors (ref_id);
-- ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS ambassador_ref_id VARCHAR(20) REFERENCES ambassadors(ref_id) ON DELETE SET NULL;
