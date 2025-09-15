<template>
  <WidgetLayoutField :widget>
    <div class="flex flex-col gap-1 w-full">
      <Select
        v-model="localValue"
        :options="selectOptions"
        v-bind="combinedProps"
        :disabled="readonly"
        class="w-full text-xs bg-[#F9F8F4] dark-theme:bg-[#0E0E12] border-[#E1DED5] dark-theme:border-[#15161C] !rounded-lg"
        size="small"
        :pt="{ option: 'text-xs' }"
        @update:model-value="onChange"
      />

      <!-- Control block -->
      <div v-if="hasControl" class="flex gap-2 items-center text-xs">
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
          <option value="increment-wrap">{{ $t('g.increment_wrap') }}</option>
        </select>
        <input
          v-if="showFilter"
          class="border rounded px-2 py-1 flex-1 bg-transparent"
          :placeholder="$t('g.filter')"
          :value="controlFilter"
          :disabled="readonly"
          @input="onFilterChange(($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>
  </WidgetLayoutField>
</template>

<script setup lang="ts">
import Select from 'primevue/select'
import { computed } from 'vue'

import { useWidgetValue } from '@/composables/graph/useWidgetValue'
import { useTransformCompatOverlayProps } from '@/composables/useTransformCompatOverlayProps'
import { t } from '@/i18n'
import { useSettingStore } from '@/stores/settingStore'
import type { SimplifiedWidget } from '@/types/simplifiedWidget'
import {
  PANEL_EXCLUDED_PROPS,
  filterWidgetProps
} from '@/utils/widgetPropFilter'

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

// Use the composable for consistent widget value handling
const { localValue, onChange } = useWidgetValue({
  widget: props.widget,
  modelValue: props.modelValue,
  defaultValue: props.widget.options?.values?.[0] || '',
  emit
})

// Transform compatibility props for overlay positioning
const transformCompatProps = useTransformCompatOverlayProps()

const combinedProps = computed(() => ({
  ...filterWidgetProps(props.widget.options, PANEL_EXCLUDED_PROPS),
  ...transformCompatProps.value
}))

// Extract select options from widget options
const selectOptions = computed(() => {
  const options = props.widget.options
  if (options?.values && Array.isArray(options.values)) return options.values
  return []
})

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

const controlFilter = computed<string>({
  get() {
    return (props.widget.options as any)?.getControlFilter?.() ?? ''
  },
  set(v: string) {
    ;(props.widget.options as any)?.setControlFilter?.(v)
  }
})

const showFilter = computed(() => controlMode.value !== 'fixed')
const onModeChange = (v: string) => (controlMode.value = v)
const onFilterChange = (v: string) => (controlFilter.value = v)

const settingStore = useSettingStore()
const controlLabel = computed(() =>
  settingStore.get('Comfy.WidgetControlMode') === 'before'
    ? t('g.control_before_generate')
    : t('g.control_after_generate')
)
</script>
