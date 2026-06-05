/** 新建分类：文件夹 + 分类线条 + 角标加号 */
export default function CategoryAddIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6.5A1.5 1.5 0 0 1 5.5 5H9l1.8 1.8H18.5A1.5 1.5 0 0 1 20 8.3V17a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17V6.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M8 10.5h8M8 13h6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.85"
      />
      <circle cx="17.5" cy="17.5" r="4.25" fill="currentColor" />
      <path
        d="M17.5 15.4v4.2M15.4 17.5h4.2"
        stroke="var(--category-add-plus-stroke, #fff)"
        strokeWidth="1.65"
        strokeLinecap="round"
      />
    </svg>
  );
}
