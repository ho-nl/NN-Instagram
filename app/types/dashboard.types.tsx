type Step = {
  id: number;
  title: string;
  description: string;
  completed: boolean;
  current: boolean;
  action: () => void;
  actionLabel: string;
  iconType: "social-post" | "refresh" | "theme";
  disabled?: boolean;
  optional?: boolean;
};
