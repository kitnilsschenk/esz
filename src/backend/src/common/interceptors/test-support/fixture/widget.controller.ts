import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuditAction } from '../../../../common/decorators/audit-action.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { TestWidgetService } from './widget.service';
import type { CreatedWidget, CreateWidgetInput } from './widget.service';

/**
 * Test-Fixture-Controller — demonstriert den vollständigen Interceptor-Stack
 * (`TransactionInterceptor` -> `AuditActionInterceptor` -> `PolicyInterceptor`
 * -> Handler mit NESTED-Fach-Transaktion) an einem minimalen, generischen
 * Beispiel-Endpoint. NUR für den Konflikt-A/B-Regressionstest — nicht Teil
 * der Produktions-Build (`test-support/**`, `tsconfig.build.json`).
 */
@Controller('test/widgets')
export class TestWidgetController {
  constructor(private readonly widgets: TestWidgetService) {}

  @Roles('betrieb')
  @AuditAction<CreatedWidget>({
    eventTyp: 'test.widget.erstellt',
    objektRefExtractor: ({ result }) => result?.id,
  })
  @Post()
  async create(@Body() body: CreateWidgetInput): Promise<CreatedWidget> {
    return this.widgets.create(body);
  }

  @Roles('admin')
  @AuditAction({ eventTyp: 'test.widget.gelesen' })
  @Get()
  async list(): Promise<{ count: number }> {
    return { count: await this.widgets.countWidgets() };
  }
}
