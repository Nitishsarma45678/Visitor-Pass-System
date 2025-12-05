export const encodeQR = pass => JSON.stringify({ id: pass.id, code: pass.code });
export const decodeQR = txt => { try { return JSON.parse(txt); } catch { return { raw: txt }; } };
