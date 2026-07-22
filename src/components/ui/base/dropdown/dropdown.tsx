import { type FC, type RefAttributes } from "react";
import { Check, ChevronRight, DotsVertical } from "@untitledui/icons";
import type {
    ButtonProps as AriaButtonProps,
    MenuItemProps as AriaMenuItemProps,
    MenuProps as AriaMenuProps,
    PopoverProps as AriaPopoverProps,
    SeparatorProps as AriaSeparatorProps,
} from "react-aria-components";
import {
    Button as AriaButton,
    Header as AriaHeader,
    Menu as AriaMenu,
    MenuItem as AriaMenuItem,
    MenuSection as AriaMenuSection,
    MenuTrigger as AriaMenuTrigger,
    Popover as AriaPopover,
    Separator as AriaSeparator,
} from "react-aria-components";
import { cx } from "@/utils/cx";

interface DropdownItemProps extends AriaMenuItemProps {
    /** The label of the item to be displayed. */
    label?: string;
    /** An addon to be displayed on the right side of the item. */
    addon?: string;
    /** If true, the item will not have any styles. */
    unstyled?: boolean;
    /** An icon to be displayed on the left side of the item. */
    icon?: FC<{ className?: string }>;
    /** Whether to show a checkmark when the item is selected. */
    selectionIndicator?: "checkmark" | "none";
}

const DropdownItem = ({
    label,
    children,
    addon,
    icon: Icon,
    unstyled,
    selectionIndicator = "checkmark",
    ...props
}: DropdownItemProps) => {
    if (unstyled) {
        return <AriaMenuItem id={label} textValue={label} {...props} />;
    }

    return (
        <AriaMenuItem
            {...props}
            className={(state) =>
                cx(
                    "group block cursor-pointer px-1.5 py-px outline-hidden",
                    state.isDisabled && "cursor-not-allowed opacity-50",
                    typeof props.className === "function" ? props.className(state) : props.className,
                )
            }
        >
            {(state) => (
                <div
                    className={cx(
                        "relative flex items-center rounded-lg px-2.5 py-2 outline-hidden transition duration-100 ease-linear",
                        !state.isDisabled && "group-hover:bg-surface-container",
                        state.isFocused && "bg-surface-container",
                        state.isFocusVisible && "ring-2 ring-inset ring-primary/40",
                        state.hasSubmenu && "pr-1.5",
                    )}
                >
                    {state.selectionMode !== "none" && !Icon && selectionIndicator === "checkmark" && (
                        <Check
                            aria-hidden="true"
                            className={cx(
                                "mr-2 size-4 shrink-0 stroke-[2.25px] text-primary",
                                !state.isSelected && "invisible",
                            )}
                        />
                    )}

                    {Icon && (
                        <Icon
                            aria-hidden="true"
                            className="mr-2 size-4 shrink-0 stroke-[2.25px] text-on-surface-variant"
                        />
                    )}

                    <span
                        className={cx(
                            "grow truncate text-sm font-medium text-on-surface",
                            state.isSelected && "font-semibold",
                        )}
                    >
                        {label || (typeof children === "function" ? children(state) : children)}
                    </span>

                    {addon && (
                        <span className="ml-1 shrink-0 pr-1 text-xs font-medium text-on-surface-variant">
                            {addon}
                        </span>
                    )}

                    {state.selectionMode !== "none" && Icon && selectionIndicator === "checkmark" && (
                        <Check
                            aria-hidden="true"
                            className={cx(
                                "ml-1 size-4 shrink-0 stroke-[2.25px] text-primary",
                                !state.isSelected && "invisible",
                            )}
                        />
                    )}

                    {state.hasSubmenu && (
                        <ChevronRight
                            aria-hidden="true"
                            className="ml-auto size-4 shrink-0 stroke-[2.25px] text-on-surface-variant"
                        />
                    )}
                </div>
            )}
        </AriaMenuItem>
    );
};

const DropdownMenu = <T extends object>(props: AriaMenuProps<T>) => {
    return (
        <AriaMenu
            {...props}
            className={(state) =>
                cx(
                    "h-min max-h-72 overflow-y-auto py-1 outline-hidden select-none",
                    typeof props.className === "function" ? props.className(state) : props.className,
                )
            }
        />
    );
};

const DropdownPopover = (props: AriaPopoverProps) => {
    return (
        <AriaPopover
            placement="bottom end"
            {...props}
            className={(state) =>
                cx(
                    "min-w-[var(--trigger-width)] origin-(--trigger-anchor-point) overflow-auto rounded-xl bg-surface-container-lowest shadow-lg ring-1 ring-outline-variant/40 will-change-transform",
                    state.isEntering && "animate-[dropdown-in_150ms_ease-out_forwards]",
                    state.isExiting && "animate-[dropdown-out_100ms_ease-in_forwards]",
                    typeof props.className === "function" ? props.className(state) : props.className,
                )
            }
        >
            {props.children}
        </AriaPopover>
    );
};

const DropdownSeparator = (props: AriaSeparatorProps) => {
    return (
        <AriaSeparator
            {...props}
            className={cx("my-1 h-px w-full bg-outline-variant/40", props.className)}
        />
    );
};

const DropdownDotsButton = (props: AriaButtonProps & RefAttributes<HTMLButtonElement>) => {
    return (
        <AriaButton
            {...props}
            aria-label={props["aria-label"] ?? "Open menu"}
            className={(state) =>
                cx(
                    "cursor-pointer rounded-md text-on-surface-variant outline-hidden transition duration-100 ease-linear",
                    (state.isPressed || state.isHovered) && "text-on-surface",
                    (state.isPressed || state.isFocusVisible) && "ring-2 ring-primary/40 ring-offset-2",
                    typeof props.className === "function" ? props.className(state) : props.className,
                )
            }
        >
            <DotsVertical className="size-5" />
        </AriaButton>
    );
};

export const Dropdown = {
    Root: AriaMenuTrigger,
    Popover: DropdownPopover,
    Menu: DropdownMenu,
    Section: AriaMenuSection,
    SectionHeader: AriaHeader,
    Item: DropdownItem,
    Separator: DropdownSeparator,
    DotsButton: DropdownDotsButton,
};
