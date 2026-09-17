import { Module } from '@nestjs/common';
import { TestWidgetController } from './widget.controller';
import { TestWidgetService } from './widget.service';

@Module({
  controllers: [TestWidgetController],
  providers: [TestWidgetService],
})
export class TestWidgetModule {}
