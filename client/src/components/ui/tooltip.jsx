import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { cn } from "../../lib/utils"

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipArrow = TooltipPrimitive.Arrow

const TooltipContent = React.forwardRef(
  ({ className, sideOffset = 6, ...props }, ref) => (
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 overflow-hidden rounded-md px-3 py-1.5 text-xs",
        className
      )}
      style={{
        backgroundColor: '#333',
        color: '#e0e0e0',
        border: '1px solid #444',
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      }}
      {...props}
    >
      {props.children}
      <TooltipArrow style={{ fill: '#333' }} />
    </TooltipPrimitive.Content>
  )
)
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
