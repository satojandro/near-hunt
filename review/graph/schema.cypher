// NEAR Hunt review graph. Idempotent: safe to run on every load.
//
// Nodes
//   (:Project {id, name, tracks, description, demo_url, onchain_repo_url, votes, comments,
//              reviewed, model, reviewed_at, repo_status, near_integration, preliminary_score,
//              score_* , eligibility_* , verdict, red_flags, embedding})
//   (:Repo {url, owner, name, commit, first_commit, last_commit, commits, authors})
//   (:GitHubUser {login})   (:XAccount {handle})   (:NearAccount {id, network, deployed})
//   (:Tech {name})          (:Track {id})          (:Tag {name})
//   (:Note {id, text, at, scope})                  — the owner's feedback, verbatim
//
// Relationships
//   (Project)-[:HAS_REPO]->(Repo)            the repository the reviewer agent decided on
//   (Project)-[:REJECTED_REPO {why}]->(Repo) candidates it rejected, and why
//   (Repo)-[:OWNED_BY]->(GitHubUser)
//   (Project)-[:TEAM]->(GitHubUser|XAccount)
//   (Project)-[:DEPLOYS]->(NearAccount)
//   (Project)-[:USES]->(Tech)  (Project)-[:IN_TRACK]->(Track)  (Project)-[:TAGGED]->(Tag)
//   (Project)-[:RELATED {hint}]->(Project)   a reviewer's own note that two projects are related
//   (Project)-[:SIMILAR_PITCH {score}]->(Project)  nearest neighbours by embedding (derived)
//   (Project)-[:SAME_NAME]->(Project)        normalised names equal (derived)
//   (Note)-[:ABOUT]->(Project)

CREATE CONSTRAINT project_id IF NOT EXISTS FOR (p:Project) REQUIRE p.id IS UNIQUE;
CREATE CONSTRAINT repo_url IF NOT EXISTS FOR (r:Repo) REQUIRE r.url IS UNIQUE;
CREATE CONSTRAINT gh_login IF NOT EXISTS FOR (u:GitHubUser) REQUIRE u.login IS UNIQUE;
CREATE CONSTRAINT x_handle IF NOT EXISTS FOR (x:XAccount) REQUIRE x.handle IS UNIQUE;
CREATE CONSTRAINT near_account IF NOT EXISTS FOR (a:NearAccount) REQUIRE a.id IS UNIQUE;
CREATE CONSTRAINT tech_name IF NOT EXISTS FOR (t:Tech) REQUIRE t.name IS UNIQUE;
CREATE CONSTRAINT track_id IF NOT EXISTS FOR (t:Track) REQUIRE t.id IS UNIQUE;
CREATE CONSTRAINT tag_name IF NOT EXISTS FOR (t:Tag) REQUIRE t.name IS UNIQUE;
CREATE CONSTRAINT note_id IF NOT EXISTS FOR (n:Note) REQUIRE n.id IS UNIQUE;
CREATE INDEX project_name IF NOT EXISTS FOR (p:Project) ON (p.name_key);
CREATE FULLTEXT INDEX project_text IF NOT EXISTS FOR (p:Project) ON EACH [p.name, p.description, p.verdict];
CREATE VECTOR INDEX project_embedding IF NOT EXISTS FOR (p:Project) ON (p.embedding)
  OPTIONS { indexConfig: { `vector.dimensions`: 1536, `vector.similarity_function`: 'cosine' } };
