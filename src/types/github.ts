/**
 * GitHub Search API types (REST API version 2026-03-10).
 *
 * Source: https://docs.github.com/en/rest/search/search?apiVersion=2026-03-10
 * Schema: github/rest-api-description, api.github.com.2026-03-10.json
 *
 * Field optionality follows the OpenAPI `required` list:
 * required → plain field, not required → `?`, nullable → `| null`.
 *
 * | Endpoint                  | Params                   | Response                  | Auth                 |
 * | ------------------------- | ------------------------ | ------------------------- | -------------------- |
 * | GET /search/repositories  | RepositorySearchParams   | RepositorySearchResponse  | optional             |
 * | GET /search/users         | UserSearchParams         | UserSearchResponse        | optional             |
 * | GET /search/code          | CodeSearchParams         | CodeSearchResponse        | required, 10 req/min |
 * | GET /search/commits       | CommitSearchParams       | CommitSearchResponse      | optional             |
 * | GET /search/issues        | IssueSearchParams        | IssueSearchResponse       | optional *           |
 * | GET /search/labels        | LabelSearchParams        | LabelSearchResponse       | optional             |
 * | GET /search/topics        | TopicSearchParams        | TopicSearchResponse       | optional             |
 *
 * * Issue search with `search_type` semantic/hybrid requires auth and is limited to 10 req/min.
 */

/** ISO 8601 timestamp */
export type DateTimeString = string

/** URI template such as "https://api.github.com/users/octocat/following{/other_user}" */
export type UriTemplate = string

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

export type SearchOrder = 'desc' | 'asc'

export interface PaginationParams {
  /** 1–100. Default: 30 */
  per_page?: number
  /** Default: 1. The API returns at most 1000 results per search. */
  page?: number
}

export interface SearchParams extends PaginationParams {
  /** Keywords plus qualifiers, e.g. "react language:typescript stars:>1000" */
  q: string
}

export interface SortableSearchParams<TSort extends string> extends SearchParams {
  /** Defaults to best match when omitted */
  sort?: TSort
  /** Ignored unless `sort` is provided. Default: "desc" */
  order?: SearchOrder
}

export type RepositorySearchSort = 'stars' | 'forks' | 'help-wanted-issues' | 'updated'

export type UserSearchSort = 'followers' | 'repositories' | 'joined'

export type CommitSearchSort = 'author-date' | 'committer-date'

export type IssueSearchSort =
  | 'comments'
  | 'reactions'
  | 'reactions-+1'
  | 'reactions--1'
  | 'reactions-smile'
  | 'reactions-thinking_face'
  | 'reactions-heart'
  | 'reactions-tada'
  | 'interactions'
  | 'created'
  | 'updated'

export type LabelSearchSort = 'created' | 'updated'

/** GET /search/repositories */
export type RepositorySearchParams = SortableSearchParams<RepositorySearchSort>

/** GET /search/users */
export type UserSearchParams = SortableSearchParams<UserSearchSort>

/**
 * GET /search/code
 *
 * Only the default branch and files under 384 KB are searched, and `q` must
 * contain at least one search term (e.g. "language:go" alone is rejected).
 */
export interface CodeSearchParams extends SearchParams {
  /** @deprecated */
  sort?: 'indexed'
  /** @deprecated */
  order?: SearchOrder
}

/** GET /search/commits */
export type CommitSearchParams = SortableSearchParams<CommitSearchSort>

/**
 * GET /search/issues (issues and pull requests)
 *
 * Use the `is:issue` / `is:pull-request` qualifiers to narrow the type.
 */
export interface IssueSearchParams extends SortableSearchParams<IssueSearchSort> {
  /** Set to "true" to use advanced search */
  advanced_search?: string
  /** Default: lexical. Semantic and hybrid require authentication. */
  search_type?: 'semantic' | 'hybrid'
}

/** GET /search/labels */
export interface LabelSearchParams extends SortableSearchParams<LabelSearchSort> {
  /** Labels are searched within this repository only */
  repository_id: number
}

/** GET /search/topics */
export type TopicSearchParams = SearchParams

// ---------------------------------------------------------------------------
// Shared response pieces
// ---------------------------------------------------------------------------

/** 200 response body shared by every search endpoint */
export interface SearchResponse<TItem> {
  total_count: number
  /** true when the search timed out and results may be partial */
  incomplete_results: boolean
  items: TItem[]
}

/** Only present when requested with `Accept: application/vnd.github.text-match+json` */
export interface SearchResultTextMatch {
  object_url?: string
  object_type?: string | null
  property?: string
  fragment?: string
  matches?: {
    text?: string
    /** [start, end] offsets into `fragment` */
    indices?: number[]
  }[]
}

export interface SimpleUser {
  name?: string | null
  email?: string | null
  login: string
  id: number
  node_id: string
  avatar_url: string
  gravatar_id: string | null
  url: string
  html_url: string
  followers_url: string
  following_url: UriTemplate
  gists_url: UriTemplate
  starred_url: UriTemplate
  subscriptions_url: string
  organizations_url: string
  repos_url: string
  events_url: UriTemplate
  received_events_url: string
  /** "User" | "Organization" | "Bot" */
  type: string
  site_admin: boolean
  starred_at?: string
  user_view_type?: string
}

export interface LicenseSimple {
  /** e.g. "mit" */
  key: string
  /** e.g. "MIT License" */
  name: string
  url: string | null
  /** e.g. "MIT" */
  spdx_id: string | null
  node_id: string
  html_url?: string
}

export interface RepositoryPermissions {
  admin: boolean
  maintain?: boolean
  push: boolean
  triage?: boolean
  pull: boolean
}

/** API URL fields present on every repository shape */
export interface RepositoryApiUrls {
  url: string
  html_url: string
  forks_url: string
  keys_url: UriTemplate
  collaborators_url: UriTemplate
  teams_url: string
  hooks_url: string
  issue_events_url: UriTemplate
  events_url: string
  assignees_url: UriTemplate
  branches_url: UriTemplate
  tags_url: string
  blobs_url: UriTemplate
  git_tags_url: UriTemplate
  git_refs_url: UriTemplate
  trees_url: UriTemplate
  statuses_url: UriTemplate
  languages_url: string
  stargazers_url: string
  contributors_url: string
  subscribers_url: string
  subscription_url: string
  commits_url: UriTemplate
  git_commits_url: UriTemplate
  comments_url: UriTemplate
  issue_comment_url: UriTemplate
  contents_url: UriTemplate
  compare_url: UriTemplate
  merges_url: string
  archive_url: UriTemplate
  downloads_url: string
  issues_url: UriTemplate
  pulls_url: UriTemplate
  milestones_url: UriTemplate
  notifications_url: UriTemplate
  labels_url: UriTemplate
  releases_url: UriTemplate
  deployments_url: string
}

export interface CodeOfConduct {
  key: string
  name: string
  url: string
  body?: string
  html_url: string | null
}

export interface SecurityFeatureStatus {
  status?: 'enabled' | 'disabled'
}

export interface SecurityAndAnalysis {
  advanced_security?: SecurityFeatureStatus
  code_security?: SecurityFeatureStatus
  dependabot_security_updates?: SecurityFeatureStatus
  secret_scanning?: SecurityFeatureStatus
  secret_scanning_push_protection?: SecurityFeatureStatus
  secret_scanning_non_provider_patterns?: SecurityFeatureStatus
  secret_scanning_ai_detection?: SecurityFeatureStatus
  secret_scanning_delegated_alert_dismissal?: SecurityFeatureStatus
  secret_scanning_delegated_bypass?: SecurityFeatureStatus
  secret_scanning_delegated_bypass_options?: {
    reviewers?: {
      reviewer_id: number
      reviewer_type: 'TEAM' | 'ROLE'
      mode?: 'ALWAYS' | 'EXEMPT'
    }[]
  }
}

/** Repository embedded in code and commit search results */
export interface MinimalRepository extends RepositoryApiUrls {
  id: number
  node_id: string
  name: string
  full_name: string
  owner: SimpleUser
  private: boolean
  description: string | null
  fork: boolean
  git_url?: string
  ssh_url?: string
  clone_url?: string
  svn_url?: string
  mirror_url?: string | null
  homepage?: string | null
  language?: string | null
  forks_count?: number
  stargazers_count?: number
  watchers_count?: number
  /** Size in KB */
  size?: number
  default_branch?: string
  open_issues_count?: number
  is_template?: boolean
  topics?: string[]
  has_issues?: boolean
  has_projects?: boolean
  has_wiki?: boolean
  has_pages?: boolean
  has_discussions?: boolean
  has_pull_requests?: boolean
  pull_request_creation_policy?: 'all' | 'collaborators_only'
  archived?: boolean
  disabled?: boolean
  visibility?: string
  pushed_at?: DateTimeString | null
  created_at?: DateTimeString | null
  updated_at?: DateTimeString | null
  permissions?: Partial<RepositoryPermissions>
  role_name?: string
  temp_clone_token?: string
  delete_branch_on_merge?: boolean
  subscribers_count?: number
  network_count?: number
  code_of_conduct?: CodeOfConduct
  license?: Partial<Omit<LicenseSimple, 'html_url'>> | null
  forks?: number
  open_issues?: number
  watchers?: number
  allow_forking?: boolean
  web_commit_signoff_required?: boolean
  security_and_analysis?: SecurityAndAnalysis | null
  custom_properties?: Record<string, unknown>
}

/** Full repository, embedded in issue search results */
export interface Repository extends RepositoryApiUrls {
  id: number
  node_id: string
  name: string
  full_name: string
  license: LicenseSimple | null
  forks: number
  permissions?: RepositoryPermissions
  owner: SimpleUser
  private: boolean
  description: string | null
  fork: boolean
  git_url: string
  ssh_url: string
  clone_url: string
  svn_url: string
  mirror_url: string | null
  homepage: string | null
  language: string | null
  forks_count: number
  stargazers_count: number
  watchers_count: number
  /** Size in KB */
  size: number
  default_branch: string
  open_issues_count: number
  is_template?: boolean
  topics?: string[]
  has_issues: boolean
  has_projects: boolean
  has_wiki: boolean
  has_pages: boolean
  has_discussions?: boolean
  has_pull_requests?: boolean
  pull_request_creation_policy?: 'all' | 'collaborators_only'
  archived: boolean
  disabled: boolean
  visibility?: string
  pushed_at: DateTimeString | null
  created_at: DateTimeString | null
  updated_at: DateTimeString | null
  allow_rebase_merge?: boolean
  temp_clone_token?: string
  allow_squash_merge?: boolean
  allow_auto_merge?: boolean
  delete_branch_on_merge?: boolean
  allow_update_branch?: boolean
  squash_merge_commit_title?: 'PR_TITLE' | 'COMMIT_OR_PR_TITLE'
  squash_merge_commit_message?: 'PR_BODY' | 'COMMIT_MESSAGES' | 'BLANK'
  merge_commit_title?: 'PR_TITLE' | 'MERGE_MESSAGE'
  merge_commit_message?: 'PR_BODY' | 'PR_TITLE' | 'BLANK'
  allow_merge_commit?: boolean
  allow_forking?: boolean
  web_commit_signoff_required?: boolean
  open_issues: number
  watchers: number
  starred_at?: string
  anonymous_access_enabled?: boolean
  code_search_index_status?: {
    lexical_search_ok?: boolean
    lexical_commit_sha?: string
  }
}

// ---------------------------------------------------------------------------
// GET /search/repositories
// ---------------------------------------------------------------------------

export interface RepositorySearchResultItem extends RepositoryApiUrls {
  id: number
  node_id: string
  name: string
  full_name: string
  owner: SimpleUser | null
  private: boolean
  description: string | null
  fork: boolean
  created_at: DateTimeString
  updated_at: DateTimeString
  pushed_at: DateTimeString
  homepage: string | null
  /** Size in KB */
  size: number
  stargazers_count: number
  watchers_count: number
  language: string | null
  forks_count: number
  open_issues_count: number
  master_branch?: string
  default_branch: string
  /** Relevance score */
  score: number
  git_url: string
  ssh_url: string
  clone_url: string
  svn_url: string
  forks: number
  open_issues: number
  watchers: number
  topics?: string[]
  mirror_url: string | null
  has_issues: boolean
  has_projects: boolean
  has_pages: boolean
  has_wiki: boolean
  has_downloads: boolean
  has_discussions?: boolean
  has_pull_requests?: boolean
  pull_request_creation_policy?: 'all' | 'collaborators_only'
  archived: boolean
  /** Whether this repository is disabled */
  disabled: boolean
  /** "public" | "private" | "internal" */
  visibility?: string
  license: LicenseSimple | null
  /** Absent on unauthenticated requests */
  permissions?: RepositoryPermissions
  text_matches?: SearchResultTextMatch[]
  temp_clone_token?: string
  allow_merge_commit?: boolean
  allow_squash_merge?: boolean
  allow_rebase_merge?: boolean
  allow_auto_merge?: boolean
  delete_branch_on_merge?: boolean
  allow_forking?: boolean
  is_template?: boolean
  web_commit_signoff_required?: boolean
}

export type RepositorySearchResponse = SearchResponse<RepositorySearchResultItem>

// ---------------------------------------------------------------------------
// GET /search/users
// ---------------------------------------------------------------------------

export interface UserSearchResultItem {
  login: string
  id: number
  node_id: string
  avatar_url: string
  gravatar_id: string | null
  url: string
  html_url: string
  followers_url: string
  subscriptions_url: string
  organizations_url: string
  repos_url: string
  received_events_url: string
  /** "User" | "Organization" */
  type: string
  /** Relevance score */
  score: number
  following_url: UriTemplate
  gists_url: UriTemplate
  starred_url: UriTemplate
  events_url: UriTemplate
  site_admin: boolean
  user_view_type?: string
  text_matches?: SearchResultTextMatch[]

  // Profile fields below are in the schema but usually absent from search
  // results; fetch GET /users/{username} for the full profile.
  public_repos?: number
  public_gists?: number
  followers?: number
  following?: number
  created_at?: DateTimeString
  updated_at?: DateTimeString
  name?: string | null
  bio?: string | null
  email?: string | null
  location?: string | null
  hireable?: boolean | null
  blog?: string | null
  company?: string | null
  suspended_at?: DateTimeString | null
}

export type UserSearchResponse = SearchResponse<UserSearchResultItem>

// ---------------------------------------------------------------------------
// GET /search/code
// ---------------------------------------------------------------------------

export interface CodeSearchResultItem {
  /** File name */
  name: string
  /** Path within the repository */
  path: string
  sha: string
  url: string
  git_url: string
  html_url: string
  repository: MinimalRepository
  /** Relevance score */
  score: number
  file_size?: number
  language?: string | null
  last_modified_at?: DateTimeString
  line_numbers?: string[]
  text_matches?: SearchResultTextMatch[]
}

export type CodeSearchResponse = SearchResponse<CodeSearchResultItem>

// ---------------------------------------------------------------------------
// GET /search/commits
// ---------------------------------------------------------------------------

export interface GitUser {
  name?: string
  email?: string
  date?: DateTimeString
}

export interface Verification {
  verified: boolean
  reason: string
  payload: string | null
  signature: string | null
  verified_at: string | null
}

export interface CommitSearchResultItem {
  url: string
  sha: string
  node_id: string
  html_url: string
  comments_url: string
  commit: {
    author: {
      name: string
      email: string
      date: DateTimeString
    }
    committer: GitUser | null
    comment_count: number
    message: string
    tree: {
      sha: string
      url: string
    }
    url: string
    verification?: Verification
  }
  /** GitHub account of the author, null when the email isn't linked to one */
  author: SimpleUser | null
  committer: GitUser | null
  parents: {
    url?: string
    html_url?: string
    sha?: string
  }[]
  repository: MinimalRepository
  /** Relevance score */
  score: number
  text_matches?: SearchResultTextMatch[]
}

export type CommitSearchResponse = SearchResponse<CommitSearchResultItem>

// ---------------------------------------------------------------------------
// GET /search/issues
// ---------------------------------------------------------------------------

export type AuthorAssociation =
  'COLLABORATOR' | 'CONTRIBUTOR' | 'FIRST_TIMER' | 'FIRST_TIME_CONTRIBUTOR' | 'MANNEQUIN' | 'MEMBER' | 'NONE' | 'OWNER'

export interface IssueLabel {
  id?: number
  node_id?: string
  url?: string
  name?: string
  color?: string
  default?: boolean
  description?: string | null
  archived_at?: DateTimeString | null
  archived_by?: SimpleUser | null
}

export interface Milestone {
  url: string
  html_url: string
  labels_url: string
  id: number
  node_id: string
  number: number
  state: 'open' | 'closed'
  title: string
  description: string | null
  creator: SimpleUser | null
  open_issues: number
  closed_issues: number
  created_at: DateTimeString
  updated_at: DateTimeString
  closed_at: DateTimeString | null
  due_on: DateTimeString | null
}

export interface IssueType {
  id: number
  node_id: string
  name: string
  description: string | null
  color?: 'gray' | 'blue' | 'green' | 'yellow' | 'orange' | 'red' | 'pink' | 'purple' | null
  created_at?: DateTimeString
  updated_at?: DateTimeString
  is_enabled?: boolean
}

export interface SubIssuesSummary {
  total: number
  completed: number
  percent_completed: number
}

export interface IssueDependenciesSummary {
  blocked_by: number
  blocking: number
  total_blocked_by: number
  total_blocking: number
}

export interface IssueFieldSelectOption {
  id: number
  name: string
  color: string
}

export interface IssueFieldValue {
  issue_field_id: number
  issue_field_name?: string
  node_id: string
  data_type: 'text' | 'single_select' | 'multi_select' | 'number' | 'date'
  value: string | number | null
  single_select_option?: IssueFieldSelectOption | null
  multi_select_options?: IssueFieldSelectOption[] | null
}

export interface ReactionRollup {
  url: string
  total_count: number
  '+1': number
  '-1': number
  laugh: number
  confused: number
  heart: number
  hooray: number
  eyes: number
  rocket: number
}

export interface Enterprise {
  description?: string | null
  html_url: string
  website_url?: string | null
  id: number
  node_id: string
  name: string
  slug: string
  created_at: DateTimeString | null
  updated_at: DateTimeString | null
  avatar_url: string
}

export interface GitHubApp {
  id: number
  slug?: string
  node_id: string
  client_id?: string
  owner: SimpleUser | Enterprise
  name: string
  description: string | null
  external_url: string
  html_url: string
  created_at: DateTimeString
  updated_at: DateTimeString
  permissions: {
    issues?: string
    checks?: string
    metadata?: string
    contents?: string
    deployments?: string
    [permission: string]: string | undefined
  }
  events: string[]
  installations_count?: number
}

export interface IssueComment {
  id: number
  node_id: string
  url: string
  body?: string
  body_text?: string
  body_html?: string
  html_url: string
  user: SimpleUser | null
  created_at: DateTimeString
  updated_at: DateTimeString
  issue_url: string
  author_association?: AuthorAssociation
  performed_via_github_app?: GitHubApp | null
  reactions?: ReactionRollup
  pin?: {
    pinned_at: DateTimeString
    pinned_by: SimpleUser | null
  } | null
  minimized?: {
    reason: string | null
  } | null
}

/** An issue or a pull request (pull requests carry `pull_request`) */
export interface IssueSearchResultItem {
  url: string
  repository_url: string
  labels_url: UriTemplate
  comments_url: string
  events_url: string
  html_url: string
  id: number
  node_id: string
  number: number
  title: string
  locked: boolean
  active_lock_reason?: string | null
  assignees?: SimpleUser[] | null
  user: SimpleUser | null
  labels: IssueLabel[]
  sub_issues_summary?: SubIssuesSummary
  issue_dependencies_summary?: IssueDependenciesSummary
  issue_field_values?: IssueFieldValue[]
  /** "open" | "closed" */
  state: string
  state_reason?: string | null
  milestone: Milestone | null
  comments: number
  created_at: DateTimeString
  updated_at: DateTimeString
  closed_at: DateTimeString | null
  text_matches?: SearchResultTextMatch[]
  /** Present only when the result is a pull request */
  pull_request?: {
    merged_at?: DateTimeString | null
    diff_url: string | null
    html_url: string | null
    patch_url: string | null
    url: string | null
  }
  body?: string
  /** Relevance score */
  score: number
  author_association: AuthorAssociation
  draft?: boolean
  repository?: Repository
  body_html?: string
  body_text?: string
  timeline_url?: string
  type?: IssueType | null
  performed_via_github_app?: GitHubApp | null
  pinned_comment?: IssueComment | null
  reactions?: ReactionRollup
}

export type IssueSearchType = 'lexical' | 'semantic' | 'hybrid'

export type LexicalFallbackReason =
  | 'no_text_terms'
  | 'quoted_text'
  | 'non_issue_target'
  | 'or_boolean_not_supported'
  | 'no_accessible_repos'
  | 'server_error'
  | 'only_non_semantic_fields_requested'
  | 'service_unavailable'

export interface IssueSearchResponse extends SearchResponse<IssueSearchResultItem> {
  /** The search type actually performed */
  search_type: IssueSearchType
  /** Why a semantic/hybrid request fell back to lexical search */
  lexical_fallback_reason?: LexicalFallbackReason[]
}

// ---------------------------------------------------------------------------
// GET /search/labels
// ---------------------------------------------------------------------------

export interface LabelSearchResultItem {
  id: number
  node_id: string
  url: string
  name: string
  /** Hex color without "#", e.g. "d73a4a" */
  color: string
  default: boolean
  description: string | null
  archived_at: DateTimeString | null
  archived_by: SimpleUser | null
  /** Relevance score */
  score: number
  text_matches?: SearchResultTextMatch[]
}

export type LabelSearchResponse = SearchResponse<LabelSearchResultItem>

// ---------------------------------------------------------------------------
// GET /search/topics
// ---------------------------------------------------------------------------

export interface TopicRelation {
  topic_relation?: {
    id?: number
    name?: string
    topic_id?: number
    relation_type?: string
  }
}

export interface TopicSearchResultItem {
  name: string
  display_name: string | null
  short_description: string | null
  description: string | null
  created_by: string | null
  released: string | null
  created_at: DateTimeString
  updated_at: DateTimeString
  featured: boolean
  curated: boolean
  /** Relevance score */
  score: number
  repository_count?: number | null
  logo_url?: string | null
  text_matches?: SearchResultTextMatch[]
  related?: TopicRelation[] | null
  aliases?: TopicRelation[] | null
}

export type TopicSearchResponse = SearchResponse<TopicSearchResultItem>

// ---------------------------------------------------------------------------
// Errors (304 Not Modified has no body)
// ---------------------------------------------------------------------------

/** 401 / 403 / 404 */
export interface BasicError {
  message?: string
  documentation_url?: string
  url?: string
  status?: string
}

/** 422 — validation failed, or the endpoint has been spammed */
export interface ValidationError {
  message: string
  documentation_url: string
  errors?: {
    resource?: string
    field?: string
    message?: string
    code: string
    index?: number
    value?: string | number | string[] | null
  }[]
}

/** 503 — service unavailable */
export interface ServiceUnavailableError {
  code?: string
  message?: string
  documentation_url?: string
}

// ---------------------------------------------------------------------------
// Endpoint map: search type → params / response
// ---------------------------------------------------------------------------

export interface SearchEndpoints {
  repositories: { params: RepositorySearchParams; response: RepositorySearchResponse }
  users: { params: UserSearchParams; response: UserSearchResponse }
  code: { params: CodeSearchParams; response: CodeSearchResponse }
  commits: { params: CommitSearchParams; response: CommitSearchResponse }
  issues: { params: IssueSearchParams; response: IssueSearchResponse }
  labels: { params: LabelSearchParams; response: LabelSearchResponse }
  topics: { params: TopicSearchParams; response: TopicSearchResponse }
}

/** Path segment after /search/ */
export type SearchType = keyof SearchEndpoints
