<script setup lang="ts">
import AppPanel from '~/components/layout/AppPanel.vue'

withDefaults(defineProps<{
  variant?: 'edit' | 'updating'
}>(), {
  variant: 'edit',
})

const tracks = [
  { title: 'Elmo’s Song', time: '2:14' },
  { title: 'Rubber Duckie', time: '1:48' },
  { title: 'C is for Cookie', time: '3:02' },
] as const
</script>

<template>
  <div
    class="howto-mock"
    :class="{ 'howto-mock--updating': variant === 'updating' }"
    aria-hidden="true"
  >
    <AppPanel
      title="Bedtime Mix"
      title-emoji="Doughnut"
      heading-tone="green-lighter"
      header-bg="bg-maru-orange"
      body-bg="bg-maru-green-lighter"
      header-text-class="text-maru-black"
      class="howto-mock__panel"
    >
      <template #default>
        <div class="howto-mock__playlist-body">
          <ul
            class="howto-mock__list howto-mock__list--inset"
            :class="{ 'howto-mock__list--dimmed': variant === 'updating' }"
          >
            <li
              v-for="item in tracks"
              :key="item.title"
              class="howto-mock__track border-maru rounded-maru bg-maru-white"
            >
              <span class="playlist-handle playlist-handle--sm shrink-0 bg-maru-gray-light">
                <span /><span /><span />
              </span>
              <div class="howto-mock__thumb bg-maru-gray-light" />
              <div class="howto-mock__result-body min-w-0 flex-1">
                <p class="howto-mock__result-title font-maru-medium m-0 truncate">
                  {{ item.title }}
                </p>
                <p class="howto-mock__result-meta font-maru-mono m-0">
                  {{ item.time }}
                </p>
              </div>
              <span class="playlist-remove howto-mock__remove">
                <MaruEmoji
                  name="Fire"
                  size="sm"
                />
              </span>
            </li>
          </ul>

          <div
            v-if="variant === 'updating'"
            class="howto-mock__save-overlay bg-maru-turquoise-light"
          >
            <p class="howto-mock__save-percent font-maru-bold tabular-nums m-0">
              42%
            </p>
            <p class="howto-mock__save-overall font-maru-medium m-0">
              Saving playlist…
            </p>
            <div class="howto-mock__save-bar-wrap">
              <div class="save-progress-bar">
                <div
                  class="save-progress-bar__fill"
                  style="width: 42%"
                />
              </div>
              <span
                class="save-progress-bar__thumb"
                style="left: 42%"
              >
                <MaruEmoji
                  name="MusicalNotes"
                  size="sm"
                  class="save-progress-bar__thumb-emoji"
                />
              </span>
            </div>
            <p class="howto-mock__save-op font-maru-mono m-0 truncate">
              Processing “Rubber Duckie”
            </p>
            <div class="save-operation-bar">
              <div
                class="save-operation-bar__fill"
                style="width: 58%"
              />
            </div>
            <p class="howto-mock__save-meta font-maru-mono m-0">
              1 of 3 tracks done
            </p>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="howto-mock__footer w-full flex items-center gap-2 px-3 py-2">
          <div class="capacity-meters">
            <div class="capacity-meter capacity-meter--ok">
              <span class="capacity-meter__kind font-maru-mono">tracks</span>
              <div class="capacity-meter__bar">
                <span class="capacity-meter__seg capacity-meter__seg--on" />
                <span class="capacity-meter__seg" />
                <span class="capacity-meter__seg" />
              </div>
            </div>
            <div class="capacity-meter capacity-meter--ok">
              <span class="capacity-meter__kind font-maru-mono">time</span>
              <div class="capacity-meter__bar">
                <span class="capacity-meter__seg capacity-meter__seg--on" />
                <span class="capacity-meter__seg" />
                <span class="capacity-meter__seg" />
              </div>
            </div>
          </div>
          <div class="ml-auto flex items-center gap-2 shrink-0">
            <span class="howto-mock__footer-btn font-maru-mono">Reset</span>
            <span class="howto-mock__footer-btn howto-mock__footer-btn--primary font-maru-mono">
              {{ variant === 'updating' ? 'Updating...' : 'Update' }}
            </span>
          </div>
        </div>
      </template>
    </AppPanel>
  </div>
</template>
