export default function Wordmark({ variant = "light" }: { variant?: "light" | "dark" }) {
  return (
    <span
      className={`select-none text-[15px] tracking-[0.28em] ${
        variant === "dark" ? "text-paper" : "text-ink"
      }`}
    >
      <span className="font-semibold">AXIO</span>
      <span className="font-light">FORM</span>
    </span>
  );
}
