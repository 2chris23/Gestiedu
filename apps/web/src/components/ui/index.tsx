import * as React from "react"
import { cn } from "@/lib/utils"

export * from "./button"
export * from "./input"
export * from "./Pagination"
export * from "./ColorPicker"
export * from "./ColorCard"
export * from "./ImageUpload"

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div
            ref={ref}
            className={cn("rounded-lg border bg-card text-card-foreground shadow-sm bg-white", className)}
            {...props}
        />
    )
)
Card.displayName = "Card"

export { Card }
