export interface LocationItem {
  name: string;
  code: number;
  codename: string;
  division_type: string;
}

export const fetchProvinces = async (): Promise<LocationItem[]> => {
  const res = await fetch("https://provinces.open-api.vn/api/?depth=1");
  if (!res.ok) throw new Error("Không tải được tỉnh");

  return await res.json();
};
