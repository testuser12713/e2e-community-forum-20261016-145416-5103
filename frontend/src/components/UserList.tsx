import { Link } from "react-router-dom";
import { cn } from "../lib/cn";
import { Avatar } from "./Avatar";

export interface UserListItem {
  username: string;
  karma: number;
  href?: string;
  color?: number;
}

export interface UserListProps {
  users: UserListItem[];
  className?: string;
}

/** Compact roster of members with their karma (sidebar card). */
export function UserList({ users, className }: UserListProps) {
  return (
    <div className={cn("user-list", className)}>
      {users.map((user) => (
        <div className="user-row" key={user.username}>
          <Avatar name={user.username} size={24} color={user.color} />
          {user.href !== undefined ? <Link to={user.href}>@{user.username}</Link> : <span>@{user.username}</span>}
          <span className="karma tabular">{user.karma}</span>
        </div>
      ))}
    </div>
  );
}
