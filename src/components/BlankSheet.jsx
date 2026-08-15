import React from "react";

export default function BlankSheet({ children, className = "", as: Tag = "div" }) {
  return (
    <Tag className={`paper-sheet ${className}`}>
      {children}
    </Tag>
  );
}