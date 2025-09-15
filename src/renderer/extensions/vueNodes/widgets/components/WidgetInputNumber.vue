<template>
  <WidgetLayoutField :widget>
    <div class="flex flex-col gap-1 w-full">
      <!-- Primary numeric control (native input for reliability) -->
      <input
        type="number"
        class="w-full text-xs bg-[#F9F8F4] dark-theme:bg-[#0E0E12] border-[#E1DED5] dark-theme:border-[#15161C] rounded-lg px-2 py-1"
        :disabled="readonly"
        :min="min"
        :max="max"
        :step="step"
        :value="localValueNumber"
        @input="onNumberInput"
      />

      <!-- Control block (Vue-native control mode) -->
      <div v-if="hasControl" class="flex gap-2 items-center text-xs mt-1">
        <span>{{ controlLabel }}</span>
        <select
          class="border rounded px-2 py-1 bg-transparent"
          :disabled="readonly"
          :value="controlMode"
          @change="onModeChange(($event.target as HTMLSelectElement).value)"
        >
          <option value="fixed">{{ $t('g.fixed') }}</option>
          <option value="increment">{{ $t('g.increment') }}</option>
          <option value="decrement">{{ $t('g.decrement') }}</option>
          <option value="randomize">{{ $t('g.randomize') }}</option>
        </select>
        <!-- No filter for numbers -->
      </div>
    </div>
  </WidgetLayoutField>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { useWidgetValue } from '@/composables/graph/useWidgetValue'
import { t } from '@/i18n'
import { useSettingStore } from '@/stores/settingStore'
import type { SimplifiedWidget } from '@/types/simplifiedWidget'

import WidgetLayoutField from './layout/WidgetLayoutField.vue'

const props = defineProps<{
  widget: SimplifiedWidget<string | number | undefined>
  modelValue: string | number | undefined
  readonly?: boolean
  nodeId?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | number | undefined]
}>()

// Bind the widget value; normalize to number for the input
const { localValue, onChange } = useWidgetValue({
  widget: props.widget,
  modelValue: props.modelValue,
  defaultValue: (props.widget.options?.min as number | undefined) ?? 0,
  emit
})

const min = computed(() => props.widget.options?.min ?? undefined)
const max = computed(() => props.widget.options?.max ?? undefined)
const step = computed(
  () =>
    (props.widget.options?.step2 as number | undefined) ??
    (props.widget.options?.step as number | undefined) ??
    1
)

const localValueNumber = computed<number | undefined>({
  get() {
    const v = localValue.value as unknown
    return typeof v === 'number'
      ? v
      : (v as any) == null
        ? undefined
        : Number(v)
  },
  set(v: number | undefined) {
    onChange(v)
  }
})

function onNumberInput(e: Event) {
  const el = e.target as HTMLInputElement
  onChange(el.value === '' ? undefined : el.valueAsNumber)
}

// Control UI (Vue mode)
const hasControl = computed(() =>
  Boolean(
    (props.widget.options as any)?.getControlMode &&
      (props.widget.options as any)?.setControlMode
  )
)

const controlMode = computed<string>({
  get() {
    return (props.widget.options as any)?.getControlMode?.() ?? 'fixed'
  },
  set(v: string) {
    ;(props.widget.options as any)?.setControlMode?.(v)
  }
})

const onModeChange = (v: string) => {
  controlMode.value = v
}

const settingStore = useSettingStore()
const controlLabel = computed(() =>
  settingStore.get('Comfy.WidgetControlMode') === 'before'
    ? t('g.control_before_generate')
    : t('g.control_after_generate')
)
</script>
