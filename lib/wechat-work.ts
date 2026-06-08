/**
 * 企业微信 (WeChat Work) API 客户端
 *
 * API docs: https://developer.work.weixin.qq.com/document/path/90664
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WechatUserInfo {
  userid: string;
  name: string;
  department?: number[];
  position?: string;
  mobile?: string;
  avatar?: string;
  status?: number; // 1=activated, 2=disabled
}

export interface WechatDepartment {
  id: number;
  name: string;
  parentid: number;
}

export interface AccessTokenResponse {
  errcode: number;
  errmsg: string;
  access_token: string;
  expires_in: number;
}

// ── In-memory access token cache ───────────────────────────────────────────────

let cachedToken: { token: string; expiresAt: number; corpId: string; corpSecret: string } | null = null;

export function clearTokenCache(): void {
  cachedToken = null;
}

export async function getAccessToken(corpId: string, corpSecret: string): Promise<string> {
  if (
    cachedToken &&
    cachedToken.corpId === corpId &&
    cachedToken.corpSecret === corpSecret &&
    Date.now() < cachedToken.expiresAt
  ) {
    return cachedToken.token;
  }

  const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(corpSecret)}`;
  const res = await fetch(url);
  const data = (await res.json()) as AccessTokenResponse;

  if (data.errcode !== 0) {
    throw new Error(`WeChat Work gettoken error: ${data.errmsg} (errcode=${data.errcode})`);
  }

  // Cache with 200s safety margin (token expires in 7200s)
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + 7000 * 1000,
    corpId,
    corpSecret,
  };
  return data.access_token;
}

// ── OAuth ──────────────────────────────────────────────────────────────────────

export function buildOAuthUrl(corpId: string, redirectUri: string, state: string, agentId?: string): string {
  let url = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${encodeURIComponent(corpId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=snsapi_privateinfo&state=${encodeURIComponent(state)}`;
  if (agentId) {
    url += `&agentid=${encodeURIComponent(agentId)}`;
  }
  url += "#wechat_redirect";
  return url;
}

export interface WechatUserInfoByCode {
  UserId?: string;
  OpenId?: string;
  DeviceId?: string;
  errcode: number;
  errmsg: string;
}

export async function getUserInfoByCode(accessToken: string, code: string): Promise<WechatUserInfoByCode> {
  const url = `https://qyapi.weixin.qq.com/cgi-bin/user/getuserinfo?access_token=${accessToken}&code=${encodeURIComponent(code)}`;
  const res = await fetch(url);
  return (await res.json()) as WechatUserInfoByCode;
}

// ── User ───────────────────────────────────────────────────────────────────────

export interface WechatUserDetail {
  errcode: number;
  errmsg: string;
  userid: string;
  name: string;
  department?: number[];
  position?: string;
  mobile?: string;
  avatar?: string;
  status?: number;
}

export async function getUserDetail(accessToken: string, userId: string): Promise<WechatUserDetail> {
  const url = `https://qyapi.weixin.qq.com/cgi-bin/user/get?access_token=${accessToken}&userid=${encodeURIComponent(userId)}`;
  const res = await fetch(url);
  return (await res.json()) as WechatUserDetail;
}

// ── Department ─────────────────────────────────────────────────────────────────

export interface DeptListResponse {
  errcode: number;
  errmsg: string;
  department: WechatDepartment[];
}

export async function listDepartments(accessToken: string, parentId?: number): Promise<WechatDepartment[]> {
  let url = `https://qyapi.weixin.qq.com/cgi-bin/department/list?access_token=${accessToken}`;
  if (parentId !== undefined) url += `&id=${parentId}`;
  const res = await fetch(url);
  const data = (await res.json()) as DeptListResponse;
  if (data.errcode !== 0) throw new Error(`WeChat department list error: ${data.errmsg}`);
  return data.department;
}

// ── User List ──────────────────────────────────────────────────────────────────

export interface UserListResponse {
  errcode: number;
  errmsg: string;
  userlist: Array<{
    userid: string;
    name: string;
    department: number[];
    position?: string;
    mobile?: string;
    avatar?: string;
    status?: number;
  }>;
}

export async function listUsersByDept(
  accessToken: string,
  deptId: number,
  fetchChild = true,
): Promise<UserListResponse["userlist"]> {
  const url = `https://qyapi.weixin.qq.com/cgi-bin/user/list?access_token=${accessToken}&department_id=${deptId}&fetch_child=${fetchChild ? 1 : 0}`;
  const res = await fetch(url);
  const data = (await res.json()) as UserListResponse;
  if (data.errcode !== 0) throw new Error(`WeChat user list error: ${data.errmsg}`);
  return data.userlist;
}

// ── Test Connection ────────────────────────────────────────────────────────────

export async function testConnection(corpId: string, corpSecret: string): Promise<{ ok: boolean; message: string }> {
  try {
    const token = await getAccessToken(corpId, corpSecret);
    const depts = await listDepartments(token).catch(() => [] as WechatDepartment[]);
    return { ok: true, message: `Connection successful. ${depts.length} departments found.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
