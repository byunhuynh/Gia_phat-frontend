// src/utils/avatar.ts

/**
 * Generate UI Avatar URL from name
 * Dùng cho trường hợp không có avatar hoặc avatar lỗi
 */
export const getUiAvatar = (
  name: string,
  background: string = "0ea5e9", // xanh dương thương hiệu giống logo
  color: string = "fff",
): string => {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(
    name,
  )}&background=${background}&color=${color}&bold=true`;
};

/**
 * Lấy avatar hợp lệ cho user
 * Ưu tiên avatar thật nếu có, nếu không dùng UI Avatar
 */
export const getUserAvatar = (name: string, avatar?: string | null): string => {
  if (avatar && avatar.trim() !== "") {
    return avatar;
  }

  return getUiAvatar(name);
};
