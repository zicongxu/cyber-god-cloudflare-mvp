CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL DEFAULT '凡人',
  level INTEGER NOT NULL DEFAULT 1,
  exp INTEGER NOT NULL DEFAULT 0,
  wisdom INTEGER NOT NULL DEFAULT 0,
  discipline INTEGER NOT NULL DEFAULT 0,
  courage INTEGER NOT NULL DEFAULT 0,
  compassion INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS confession_flows (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  confession_id TEXT,
  judgement_id TEXT,
  task_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS confessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  behavior_type TEXT,
  severity TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS judgements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  confession_id TEXT NOT NULL,
  rap_text TEXT NOT NULL,
  sin_name TEXT NOT NULL,
  sentence_text TEXT NOT NULL,
  roast_level INTEGER NOT NULL DEFAULT 3,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS redemption_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  confession_id TEXT NOT NULL,
  title TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  reward_wisdom INTEGER NOT NULL DEFAULT 0,
  reward_discipline INTEGER NOT NULL DEFAULT 0,
  reward_courage INTEGER NOT NULL DEFAULT 0,
  reward_compassion INTEGER NOT NULL DEFAULT 0,
  reward_exp INTEGER NOT NULL DEFAULT 0,
  verify_type TEXT NOT NULL DEFAULT 'self_report',
  status TEXT NOT NULL,
  parent_task_id TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS redemption_witnesses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  witness_type TEXT NOT NULL DEFAULT 'text',
  content TEXT,
  file_key TEXT,
  self_confirmation_text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reward_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  reward_wisdom INTEGER NOT NULL DEFAULT 0,
  reward_discipline INTEGER NOT NULL DEFAULT 0,
  reward_courage INTEGER NOT NULL DEFAULT 0,
  reward_compassion INTEGER NOT NULL DEFAULT 0,
  reward_exp INTEGER NOT NULL DEFAULT 0,
  before_level INTEGER NOT NULL,
  after_level INTEGER NOT NULL,
  before_exp INTEGER NOT NULL,
  after_exp INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(task_id, event_type)
);

CREATE TABLE IF NOT EXISTS oracle_unlocks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  flow_id TEXT NOT NULL,
  level INTEGER NOT NULL,
  oracle_text TEXT NOT NULL,
  unlocked_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_flows_user_created ON confession_flows(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON redemption_tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_rewards_task ON reward_events(task_id);
