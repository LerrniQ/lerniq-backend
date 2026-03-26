CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(255)  NOT NULL,
  email          VARCHAR(255)  UNIQUE NOT NULL,
  school         VARCHAR(255)  NOT NULL,
  role           VARCHAR(50)   NOT NULL CHECK (role IN ('student', 'course_rep', 'lecturer')),
  ref_id         VARCHAR(20)   UNIQUE NOT NULL,
  referred_by    VARCHAR(20)   REFERENCES users (ref_id) ON DELETE SET NULL,
  referral_count INTEGER       DEFAULT 0,
  created_at     TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_ref_id      ON users (ref_id);
CREATE INDEX IF NOT EXISTS idx_users_email        ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_referred_by  ON users (referred_by);

CREATE TABLE IF NOT EXISTS admins (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255)        NOT NULL,
  created_at    TIMESTAMPTZ         DEFAULT NOW()
);
